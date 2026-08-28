import { Id, TableNames } from './_generated/dataModel';
import { internal } from './_generated/api';
import {
  DatabaseReader,
  internalAction,
  internalMutation,
  mutation,
  query,
} from './_generated/server';
import { v } from 'convex/values';
import schema from './schema';
import { DELETE_BATCH_SIZE } from './constants';
import { kickEngine, startEngine, stopEngine } from './aiTown/main';
import { insertInput } from './aiTown/insertInput';
import { fetchEmbedding } from './util/llm';
import { chatCompletion } from './util/llm';
import { startConversationMessage } from './agent/conversation';
import { GameId } from './aiTown/ids';
import * as gentleMap from '../data/gentle';
import { blockedWithPositions } from './aiTown/movement';
import { WorldMap } from './aiTown/worldMap';
import { Point } from './util/types';

// Clear all of the tables except for the embeddings cache.
const excludedTables: Array<TableNames> = ['embeddingsCache'];

export const wipeAllTables = internalMutation({
  handler: async (ctx) => {
    for (const tableName of Object.keys(schema.tables)) {
      if (excludedTables.includes(tableName as TableNames)) {
        continue;
      }
      await ctx.scheduler.runAfter(0, internal.testing.deletePage, { tableName, cursor: null });
    }
  },
});

export const deletePage = internalMutation({
  args: {
    tableName: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query(args.tableName as TableNames)
      .paginate({ cursor: args.cursor, numItems: DELETE_BATCH_SIZE });
    for (const row of results.page) {
      await ctx.db.delete(row._id);
    }
    if (!results.isDone) {
      await ctx.scheduler.runAfter(0, internal.testing.deletePage, {
        tableName: args.tableName,
        cursor: results.continueCursor,
      });
    }
  },
});

export const kick = internalMutation({
  handler: async (ctx) => {
    const { worldStatus } = await getDefaultWorld(ctx.db);
    await kickEngine(ctx, worldStatus.worldId);
  },
});

// One-shot repair: resets processedInputNumber on the default world's engine
// to a specified value so the engine stops skipping inputs. Use when
// processedInputNumber is ahead of the actual input sequence (e.g. after
// a botched engine migration that carried over a stale cursor).
export const resetInputCursor = internalMutation({
  args: { processedInputNumber: v.number() },
  handler: async (ctx, args) => {
    const { engine } = await getDefaultWorld(ctx.db);
    await ctx.db.patch(engine._id, { processedInputNumber: args.processedInputNumber });
    console.log(`Reset processedInputNumber to ${args.processedInputNumber} for engine ${engine._id}`);
  },
});

export const stopAllowed = query({
  handler: async () => {
    return !process.env.STOP_NOT_ALLOWED;
  },
});

export const stop = mutation({
  handler: async (ctx) => {
    if (process.env.STOP_NOT_ALLOWED) throw new Error('Stop not allowed');
    const { worldStatus, engine } = await getDefaultWorld(ctx.db);
    if (worldStatus.status === 'inactive' || worldStatus.status === 'stoppedByDeveloper') {
      if (engine.running) {
        throw new Error(`Engine ${engine._id} isn't stopped?`);
      }
      console.debug(`World ${worldStatus.worldId} is already inactive`);
      return;
    }
    console.log(`Stopping engine ${engine._id}...`);
    await ctx.db.patch(worldStatus._id, { status: 'stoppedByDeveloper' });
    await stopEngine(ctx, worldStatus.worldId);
  },
});

export const resume = mutation({
  handler: async (ctx) => {
    const { worldStatus, engine } = await getDefaultWorld(ctx.db);
    if (worldStatus.status === 'running') {
      if (!engine.running) {
        throw new Error(`Engine ${engine._id} isn't running?`);
      }
      console.debug(`World ${worldStatus.worldId} is already running`);
      return;
    }
    console.log(
      `Resuming engine ${engine._id} for world ${worldStatus.worldId} (state: ${worldStatus.status})...`,
    );
    await ctx.db.patch(worldStatus._id, { status: 'running' });
    await startEngine(ctx, worldStatus.worldId);
  },
});

export const archive = internalMutation({
  handler: async (ctx) => {
    const { worldStatus, engine } = await getDefaultWorld(ctx.db);
    if (engine.running) {
      throw new Error(`Engine ${engine._id} is still running!`);
    }
    console.log(`Archiving world ${worldStatus.worldId}...`);
    await ctx.db.patch(worldStatus._id, { isDefault: false });
  },
});

// 重置世界（归档旧世界，以便 init 创建新世界）
export const resetWorld = internalMutation({
  handler: async (ctx) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .first();
    if (!worldStatus) {
      console.log('No default world found, nothing to reset');
      return;
    }
    const engine = await ctx.db.get(worldStatus.engineId);
    if (engine?.running) {
      console.log('Stopping engine first...');
      await stopEngine(ctx, worldStatus.worldId);
    }
    console.log(`Archiving world ${worldStatus.worldId}...`);
    await ctx.db.patch(worldStatus._id, { isDefault: false });
    console.log('World archived. Run "npx convex run init" to create a new world.');
  },
});

// 一次性修复：把 bundle 里（data/gentle.js）的新 objmap 原地写入默认世界的 maps 行，
// 不重置世界、不丢任何历史数据。同事务内完成三件事，缺一不可：
// 1. patch objectTiles；
// 2. 把恰好站在新墙格里的角色搬到最近空格——否则该角色会因 tickPosition 的
//    起点碰撞检查陷入 waiting/needsPath 死循环，永久卡死；
// 3. kick 引擎（bump generationNumber），让持有旧地图的在途 action 在下一次
//    saveWorld 的 generation 校验处整体作废，新 action 重新 Game.load 拿到新图。
// 幂等：重复执行只多一次无害的 kick。引擎停止时跳过 kick（kickEngine 会 throw），
// 之后 resume→startEngine 自然会重新加载地图。
export const patchMapCollision = internalMutation({
  handler: async (ctx) => {
    const { worldStatus, engine } = await getDefaultWorld(ctx.db);
    const world = await ctx.db.get(worldStatus.worldId);
    if (!world) throw new Error(`World ${worldStatus.worldId} not found`);
    const mapDoc = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', worldStatus.worldId))
      .unique();
    if (!mapDoc) throw new Error(`No map for world ${worldStatus.worldId}`);
    if (gentleMap.mapwidth !== mapDoc.width || gentleMap.mapheight !== mapDoc.height) {
      throw new Error(
        `地图尺寸不一致：bundle ${gentleMap.mapwidth}×${gentleMap.mapheight}，` +
          `DB ${mapDoc.width}×${mapDoc.height}，中止`,
      );
    }
    const objectTiles = gentleMap.objmap;
    await ctx.db.patch(mapDoc._id, { objectTiles });

    const { _id, _creationTime, worldId, ...serializedMap } = mapDoc;
    const probe = new WorldMap({ ...serializedMap, objectTiles });
    const players = world.players.map((p) => ({ ...p }));
    const rescued: string[] = [];
    for (const player of players) {
      if (blockedWithPositions(player.position, [], probe) !== 'world blocked') {
        continue;
      }
      // BFS 四邻找最近空格；目标格要求同时避开其他角色（含已救援者的新位置），
      // 防止两个受困者被搬进同一格。找不到就 throw，整个事务回滚。
      const others = players.filter((q) => q.id !== player.id).map((q) => q.position);
      const start = { x: Math.floor(player.position.x), y: Math.floor(player.position.y) };
      const queue: Point[] = [start];
      const seen = new Set([`${start.x},${start.y}`]);
      let target: Point | null = null;
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (blockedWithPositions(current, others, probe) === null) {
          target = current;
          break;
        }
        for (const next of [
          { x: current.x + 1, y: current.y },
          { x: current.x - 1, y: current.y },
          { x: current.x, y: current.y + 1 },
          { x: current.x, y: current.y - 1 },
        ]) {
          if (next.x < 0 || next.y < 0 || next.x >= mapDoc.width || next.y >= mapDoc.height) {
            continue;
          }
          const key = `${next.x},${next.y}`;
          if (!seen.has(key)) {
            seen.add(key);
            queue.push(next);
          }
        }
      }
      if (!target) {
        throw new Error(`找不到 ${player.id} 附近的空格，事务回滚`);
      }
      player.position = target;
      player.speed = 0;
      delete (player as { pathfinding?: unknown }).pathfinding;
      rescued.push(`${player.id}:(${start.x},${start.y})→(${target.x},${target.y})`);
    }
    if (rescued.length > 0) {
      await ctx.db.patch(world._id, { players });
    }
    if (engine.running) {
      await kickEngine(ctx, worldStatus.worldId);
    }
    console.log(
      `objectTiles 已更新为 ${objectTiles.length} 层（挡路 ${
        objectTiles[0].flat().filter((v: number) => v !== -1).length
      } 格）；救援 ${rescued.length} 人${rescued.length ? '：' + rescued.join('，') : ''}；kick=${
        engine.running
      }`,
    );
  },
});

async function getDefaultWorld(db: DatabaseReader) {
  const worldStatus = await db
    .query('worldStatus')
    .filter((q) => q.eq(q.field('isDefault'), true))
    .first();
  if (!worldStatus) {
    throw new Error('No default world found');
  }
  const engine = await db.get(worldStatus.engineId);
  if (!engine) {
    throw new Error(`Engine ${worldStatus.engineId} not found`);
  }
  return { worldStatus, engine };
}

export const debugCreatePlayers = internalMutation({
  args: {
    numPlayers: v.number(),
  },
  handler: async (ctx, args) => {
    const { worldStatus } = await getDefaultWorld(ctx.db);
    for (let i = 0; i < args.numPlayers; i++) {
      const inputId = await insertInput(ctx, worldStatus.worldId, 'join', {
        name: `Robot${i}`,
        description: `This player is a robot.`,
        character: `f${1 + (i % 8)}`,
      });
    }
  },
});

export const randomPositions = internalMutation({
  handler: async (ctx) => {
    const { worldStatus } = await getDefaultWorld(ctx.db);
    const map = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', worldStatus.worldId))
      .unique();
    if (!map) {
      throw new Error(`No map for world ${worldStatus.worldId}`);
    }
    const world = await ctx.db.get(worldStatus.worldId);
    if (!world) {
      throw new Error(`No world for world ${worldStatus.worldId}`);
    }
    for (const player of world.players) {
      await insertInput(ctx, world._id, 'moveTo', {
        playerId: player.id,
        destination: {
          x: 1 + Math.floor(Math.random() * (map.width - 2)),
          y: 1 + Math.floor(Math.random() * (map.height - 2)),
        },
      });
    }
  },
});

export const testEmbedding = internalAction({
  args: { input: v.string() },
  handler: async (_ctx, args) => {
    return await fetchEmbedding(args.input);
  },
});

export const testCompletion = internalAction({
  args: {},
  handler: async (ctx, args) => {
    return await chatCompletion({
      messages: [
        { content: 'You are helpful', role: 'system' },
        { content: 'Where is pizza?', role: 'user' },
      ],
    });
  },
});

export const testConvo = internalAction({
  args: {},
  handler: async (ctx, args) => {
    const a: any = (await startConversationMessage(
      ctx,
      'm1707m46wmefpejw1k50rqz7856qw3ew' as Id<'worlds'>,
      'c:115' as GameId<'conversations'>,
      'p:0' as GameId<'players'>,
      'p:6' as GameId<'players'>,
    )) as any;
    return await a.readAll();
  },
});

// 直接打 LLM_API_URL 的 embeddings 端点，绕开 Jina 分支，用于确认
// 换供应商前该模型真实可用、且输出维度与 EMBEDDING_DIMENSION 一致。
export const probeEmbeddingProvider = internalAction({
  args: { model: v.string() },
  handler: async (_ctx, args) => {
    const url = process.env.LLM_API_URL;
    const key = process.env.LLM_API_KEY;
    if (!url) throw new Error('先设置 LLM_API_URL');
    const resp = await fetch(`${url.replace(/\/v1$/, '')}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({ model: args.model, input: '同福客栈的账本被人改过' }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.log(`HTTP ${resp.status}: ${text.slice(0, 500)}`);
      return { status: resp.status, error: text.slice(0, 500) };
    }
    const json = JSON.parse(text);
    const dim = json?.data?.[0]?.embedding?.length ?? null;
    console.log(`model=${args.model} status=${resp.status} dimension=${dim}`);
    return { status: resp.status, model: args.model, dimension: dim };
  },
});

// 从 Convex 云端探测 LLM_API_URL 的连通性并列出可用模型 ID。
// 本机网络与 Convex 出口不同，可达性以此为准。
export const listModels = internalAction({
  args: {},
  handler: async () => {
    const url = process.env.LLM_API_URL;
    const key = process.env.LLM_API_KEY;
    if (!url) throw new Error('先设置 LLM_API_URL');
    const resp = await fetch(`${url.replace(/\/v1$/, '')}/v1/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    });
    const text = await resp.text();
    console.log(`HTTP ${resp.status}`);
    try {
      const ids = (JSON.parse(text).data ?? []).map((m: { id: string }) => m.id);
      console.log(JSON.stringify(ids));
      return { status: resp.status, ids };
    } catch {
      return { status: resp.status, body: text.slice(0, 2000) };
    }
  },
});
