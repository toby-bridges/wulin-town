import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation, mutation, query } from './_generated/server';
import { characters } from '../data/characters';
import { insertInput } from './aiTown/insertInput';
import {
  DEFAULT_NAME,
  ENGINE_ACTION_DURATION,
  IDLE_WORLD_TIMEOUT,
  WORLD_HEARTBEAT_INTERVAL,
} from './constants';
import { playerId } from './aiTown/ids';
import { kickEngine, startEngine, stopEngine } from './aiTown/main';
import { engineInsertInput } from './engine/abstractGame';

export const defaultWorldStatus = query({
  handler: async (ctx) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .first();
    return worldStatus;
  },
});

export const heartbeatWorld = mutation({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .first();
    if (!worldStatus) {
      throw new Error(`Invalid world ID: ${args.worldId}`);
    }
    const now = Date.now();

    // Skip the update (and then potentially make the transaction readonly)
    // if it's been viewed sufficiently recently..
    if (!worldStatus.lastViewed || worldStatus.lastViewed < now - WORLD_HEARTBEAT_INTERVAL / 2) {
      await ctx.db.patch(worldStatus._id, {
        lastViewed: Math.max(worldStatus.lastViewed ?? now, now),
      });
    }

    // Restart inactive worlds, but leave worlds explicitly stopped by the developer alone.
    if (worldStatus.status === 'stoppedByDeveloper') {
      console.debug(`World ${worldStatus._id} is stopped by developer, not restarting.`);
    }
    if (worldStatus.status === 'inactive') {
      console.log(`Restarting inactive world ${worldStatus._id}...`);
      await ctx.db.patch(worldStatus._id, { status: 'running' });
      await startEngine(ctx, worldStatus.worldId);
      // 访客唤醒休眠世界时补产一条江湖事件：世界休眠期间 cron 编剧一路跳过，
      // 不补的话访客进站永远只能看到几天前的旧闻。延迟 10 秒是给访客留看开场的
      // 时间，题卡随后弹出正好接力；是否真的产出由 generateEventIfStale 复查决定。
      //
      // 只挂在 inactive→running 这个翻转点上：mutation 是事务性的，并发心跳里只有
      // 一个能提交这次翻转（其余的读集失效、OCC 重跑，重跑时看到的已是 running，
      // 不再进这个分支），所以一次唤醒天然只调度一次补产。stoppedByDeveloper 与
      // restartDeadWorlds 都不是"访客到达"，一律不挂。放在 startEngine 之后：
      // startEngine 抛错则整个事务回滚，这次调度也随之作废，正是想要的行为。
      await ctx.scheduler.runAfter(10_000, internal.director.generateEventIfStale, {});
    }
  },
});

export const stopInactiveWorlds = internalMutation({
  handler: async (ctx) => {
    const cutoff = Date.now() - IDLE_WORLD_TIMEOUT;
    const worlds = await ctx.db.query('worldStatus').collect();
    for (const worldStatus of worlds) {
      if (cutoff < worldStatus.lastViewed || worldStatus.status !== 'running') {
        continue;
      }
      const engine = await ctx.db.get(worldStatus.engineId);
      // Reconcile a stale 'running' status whose engine has already stopped:
      // just mark it inactive without trying to stop a non-running engine.
      if (engine && !engine.running) {
        console.log(`Marking world ${worldStatus._id} inactive (engine already stopped)`);
        await ctx.db.patch(worldStatus._id, { status: 'inactive' });
        continue;
      }
      console.log(`Stopping inactive world ${worldStatus._id}`);
      await ctx.db.patch(worldStatus._id, { status: 'inactive' });
      await stopEngine(ctx, worldStatus.worldId);
    }
  },
});

export const restartDeadWorlds = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();

    // Restart an engine if it hasn't run for 2x its action duration.
    const engineTimeout = now - ENGINE_ACTION_DURATION * 2;
    const worlds = await ctx.db.query('worldStatus').collect();
    for (const worldStatus of worlds) {
      if (worldStatus.status !== 'running') {
        continue;
      }
      const engine = await ctx.db.get(worldStatus.engineId);
      if (!engine) {
        console.error(`Invalid engine ID: ${worldStatus.engineId}, skipping`);
        continue;
      }
      // A status of 'running' with an engine that isn't running is an
      // inconsistent state (e.g. a crashed engine that never rescheduled).
      // Reconcile it to 'inactive' so the heartbeat path can cleanly restart
      // it, rather than calling kickEngine which throws on a stopped engine.
      if (!engine.running) {
        console.warn(`Engine ${engine._id} not running but world marked running; resetting`);
        await ctx.db.patch(worldStatus._id, { status: 'inactive' });
        continue;
      }
      if (engine.currentTime && engine.currentTime < engineTimeout) {
        console.warn(`Restarting dead engine ${engine._id}...`);
        // Isolate per-world failures so one bad world can't roll back the
        // whole cron transaction and starve healthy worlds.
        try {
          await kickEngine(ctx, worldStatus.worldId);
        } catch (e) {
          console.error(`Failed to kick engine ${engine._id}: ${(e as Error).message}`);
        }
      }
    }
  },
});

export const userStatus = query({
  args: {
    worldId: v.id('worlds'),
    visitorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // If visitorId is provided, use it; otherwise fall back to DEFAULT_NAME
    if (args.visitorId) {
      return args.visitorId;
    }
    return DEFAULT_NAME;
  },
});

export const joinWorld = mutation({
  args: {
    worldId: v.id('worlds'),
    visitorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = args.visitorId || DEFAULT_NAME;
    // Generate a friendly display name from visitor ID
    const shortId = tokenIdentifier.split('_').pop()?.substring(0, 4) || 'guest';
    const name = args.visitorId ? `访客${shortId.toUpperCase()}` : DEFAULT_NAME;

    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new ConvexError(`Invalid world ID: ${args.worldId}`);
    }

    // Check if this visitor is already in the game
    const existingPlayer = world.players.find((p) => p.human === tokenIdentifier);
    if (existingPlayer) {
      throw new ConvexError(`你已经在游戏中了`);
    }

    return await insertInput(ctx, world._id, 'join', {
      name,
      character: characters[Math.floor(Math.random() * characters.length)].name,
      description: `${name} 是一位来到同福客栈的访客`,
      tokenIdentifier,
    });
  },
});

export const leaveWorld = mutation({
  args: {
    worldId: v.id('worlds'),
    visitorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = args.visitorId || DEFAULT_NAME;
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`Invalid world ID: ${args.worldId}`);
    }
    const existingPlayer = world.players.find((p) => p.human === tokenIdentifier);
    if (!existingPlayer) {
      return;
    }
    await insertInput(ctx, world._id, 'leave', {
      playerId: existingPlayer.id,
    });
  },
});

export const sendWorldInput = mutation({
  args: {
    engineId: v.id('engines'),
    name: v.string(),
    args: v.any(),
  },
  handler: async (ctx, args) => {
    // const identity = await ctx.auth.getUserIdentity();
    // if (!identity) {
    //   throw new Error(`Not logged in`);
    // }
    return await engineInsertInput(ctx, args.engineId, args.name as any, args.args);
  },
});

export const worldState = query({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const world = await ctx.db.get(args.worldId);
    if (!world) {
      throw new Error(`Invalid world ID: ${args.worldId}`);
    }
    const worldStatus = await ctx.db
      .query('worldStatus')
      .withIndex('worldId', (q) => q.eq('worldId', world._id))
      .unique();
    if (!worldStatus) {
      throw new Error(`Invalid world status ID: ${world._id}`);
    }
    const engine = await ctx.db.get(worldStatus.engineId);
    if (!engine) {
      throw new Error(`Invalid engine ID: ${worldStatus.engineId}`);
    }
    return { world, engine };
  },
});

export const gameDescriptions = query({
  args: {
    worldId: v.id('worlds'),
  },
  handler: async (ctx, args) => {
    const playerDescriptions = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();
    const agentDescriptions = await ctx.db
      .query('agentDescriptions')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .collect();
    const worldMap = await ctx.db
      .query('maps')
      .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
      .first();
    if (!worldMap) {
      throw new Error(`No map for world: ${args.worldId}`);
    }
    return { worldMap, playerDescriptions, agentDescriptions };
  },
});

export const previousConversation = query({
  args: {
    worldId: v.id('worlds'),
    playerId,
  },
  handler: async (ctx, args) => {
    // Walk the player's history in descending order, looking for a nonempty
    // conversation.
    const members = ctx.db
      .query('participatedTogether')
      .withIndex('playerHistory', (q) => q.eq('worldId', args.worldId).eq('player1', args.playerId))
      .order('desc');

    for await (const member of members) {
      const conversation = await ctx.db
        .query('archivedConversations')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId).eq('id', member.conversationId))
        .unique();
      if (!conversation) {
        throw new Error(`Invalid conversation ID: ${member.conversationId}`);
      }
      if (conversation.numMessages > 0) {
        return conversation;
      }
    }
    return null;
  },
});

export const playerMemories = query({
  args: {
    worldId: v.id('worlds'),
    playerId,
    numberOfItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const memories = await ctx.db
      .query('memories')
      .withIndex('playerId', (q) => q.eq('playerId', args.playerId))
      .order('desc')
      .take(args.numberOfItems ?? 20);

    // Conversation memories only, so we skip this query for worlds/characters
    // with no conversation memories at all.
    const needsNames = memories.some((m) => m.data.type === 'conversation');
    const nameById = new Map<string, string>();
    if (needsNames) {
      const playerDescriptions = await ctx.db
        .query('playerDescriptions')
        .withIndex('worldId', (q) => q.eq('worldId', args.worldId))
        .collect();
      for (const p of playerDescriptions) {
        nameById.set(p.playerId, p.name);
      }
    }

    return memories.map((m) => {
      const { data } = m;
      // `otherPlayerNames` is only meaningful for `conversation` memories;
      // left undefined for the other two types (same consistent object
      // shape for every item, so the client doesn't need a type predicate
      // to use it). `data.playerIds` is "the other participants" (the
      // conversation's author already excludes itself, see
      // rememberConversation), but we still filter defensively rather than
      // assume that invariant holds, and resolve ids to display names here
      // so the client never sees a raw `p:N` id. Unresolvable ids
      // (shouldn't happen for AI agents, but could in principle for a human
      // visitor who left) are dropped rather than shown as a raw id or a
      // made-up name.
      const otherPlayerNames =
        data.type === 'conversation'
          ? data.playerIds
              .filter((id) => id !== args.playerId)
              .map((id) => nameById.get(id))
              .filter((name): name is string => !!name)
          : undefined;
      return {
        _id: m._id,
        _creationTime: m._creationTime,
        description: m.description,
        importance: m.importance,
        lastAccess: m.lastAccess,
        type: data.type,
        otherPlayerNames,
      };
    });
  },
});
