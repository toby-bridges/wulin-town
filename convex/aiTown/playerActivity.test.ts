// G1 回归测试：人类玩家的闲置计时器必须被主动操作刷新。
//
// 原缺陷：`lastInput` 全仓库只有一处写入——`Player.join` 内（player.ts:222）。
// 9 个 inputHandler 一个都不更新它，于是 `Player.tick` 里的
//   if (this.human && this.lastInput < now - HUMAN_IDLE_TOO_LONG) this.leave(...)
// 从「挂机超时」退化成「固定 5 分钟会话计时器」：访客无论在走路、聊天还是打字，
// 第 300 秒必被删除，正在进行的对话还被 leave() 一并掐断。
//
// 判据按用户裁定：只有**主动操作**算「人还在」，页面开着不算。
//
// 只从 './player' 导入是刻意的：world.ts / game.ts 会把 `_generated/server.js`
// 拉进来，那是 ESM，jest 当前配置加载不了（这也是本仓所有测试都是纯数据测试的
// 原因）。notePlayerActivity 只收一个 Map 而不是 Game/World，正是为了留出这个
// 可测的缝——策略逻辑全部在这里，分发处只剩一行调用。

import { HUMAN_IDLE_TOO_LONG } from '../constants';
import { GameId } from './ids';
import { Player, notePlayerActivity } from './player';

const HUMAN = 'p:0' as GameId<'players'>;
const AI = 'p:1' as GameId<'players'>;
const T0 = 1_000_000;

function makePlayer(id: string, human: string | undefined, lastInput: number) {
  return new Player({
    id,
    human,
    lastInput,
    position: { x: 10, y: 10 },
    facing: { dx: 1, dy: 0 },
    speed: 0,
  });
}

/** 真实 Player 对象装进真实 Map，零 mock。 */
function makePlayers(joinedAt = T0) {
  return new Map<GameId<'players'>, Player>([
    [HUMAN, makePlayer(HUMAN, 'token-abc', joinedAt)],
    [AI, makePlayer(AI, undefined, joinedAt)],
  ]);
}

/** Player.tick / leave 只碰 game.world 的这两张表。 */
function gameStub(players: Map<GameId<'players'>, Player>) {
  return { world: { players, conversations: new Map() } } as any;
}

describe('notePlayerActivity', () => {
  test('带 playerId 的输入把人类玩家的闲置计时器推到当前时刻', () => {
    const players = makePlayers();
    const now = T0 + 4 * 60 * 1000;

    notePlayerActivity(players, { playerId: HUMAN }, now);

    expect(players.get(HUMAN)!.lastInput).toBe(now);
  });

  test('不动 AI 角色的 lastInput——AI 没有闲置超时，写它只是无意义的状态 churn', () => {
    const players = makePlayers();

    notePlayerActivity(players, { playerId: AI }, T0 + 999);

    expect(players.get(AI)!.lastInput).toBe(T0);
  });

  test('输入不带 playerId 时安静跳过（join / createAgent 走的就是这条）', () => {
    const players = makePlayers();

    expect(() => notePlayerActivity(players, { tokenIdentifier: 'x' }, T0 + 1)).not.toThrow();
    expect(players.get(HUMAN)!.lastInput).toBe(T0);
  });

  test('playerId 指向已不存在的玩家时安静跳过，不抛错', () => {
    const players = makePlayers();

    // 输入队列里可能残留指向已离开玩家的输入；这里抛错会连带打挂整个 engine step。
    expect(() => notePlayerActivity(players, { playerId: 'p:99' }, T0 + 1)).not.toThrow();
  });

  test('playerId 不是字符串时安静跳过（validator 之外的脏输入不该炸引擎）', () => {
    const players = makePlayers();

    expect(() => notePlayerActivity(players, { playerId: 42 } as any, T0 + 1)).not.toThrow();
    expect(players.get(HUMAN)!.lastInput).toBe(T0);
  });

  test('计时器只向前走，不会被迟到的旧输入拨回去', () => {
    const players = makePlayers();
    const later = T0 + 4 * 60 * 1000;

    notePlayerActivity(players, { playerId: HUMAN }, later);
    notePlayerActivity(players, { playerId: HUMAN }, T0 + 1000);

    expect(players.get(HUMAN)!.lastInput).toBe(later);
  });
});

describe('闲置踢人（Player.tick）', () => {
  test('刷新过计时器的人类玩家不会被踢——这条就是 G1 的回归锁', () => {
    const players = makePlayers();
    // 加入后第 4 分钟做了一次主动操作，再走到第 6 分钟（已过 5 分钟大限）。
    notePlayerActivity(players, { playerId: HUMAN }, T0 + 4 * 60 * 1000);

    players.get(HUMAN)!.tick(gameStub(players), T0 + 6 * 60 * 1000);

    expect(players.has(HUMAN)).toBe(true);
  });

  test('真正闲置超过 HUMAN_IDLE_TOO_LONG 的人类玩家仍然被踢（别把功能改坏）', () => {
    const players = makePlayers();

    players.get(HUMAN)!.tick(gameStub(players), T0 + HUMAN_IDLE_TOO_LONG + 1);

    expect(players.has(HUMAN)).toBe(false);
  });

  test('AI 角色永不因闲置被踢，哪怕 lastInput 是远古值', () => {
    const players = makePlayers();

    players.get(AI)!.tick(gameStub(players), T0 + 100 * HUMAN_IDLE_TOO_LONG);

    expect(players.has(AI)).toBe(true);
  });
});
