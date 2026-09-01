// G2 回归测试：LLM 调用失败时角色必须立刻脱身，不能占着操作位等超时。
//
// 原缺陷：`agentOperations.ts` 的 `agentGenerateMessage` 里 `completionFn` 调用
// 没有 try/catch。403/429/5xx/网络超时一律 uncaught，`agentSendMessage` 永不执行，
// 于是 `agent.inProgressOperation` 一直挂着，要等满 `ACTION_TIMEOUT`(120s) 才被
// `Agent.tick` 清掉（agent.ts:57-63）。这 120 秒里 `startOperation` 直接 throw，
// 该角色完全惰性——不动、不说、不离开对话。生产日志实证（2026-09-01 21:05）：
//   Uncaught Error: Chat completion failed with code 403
//   Timing out {"name":"agentGenerateMessage","operationId":"o:119875"}
//
// 这个洞与欠费无关：限流、瞬时 5xx、网络抖动都会触发。
//
// 修法是给失败加一条明确的回执路径 `agentAbandonMessage`：清操作位 + 停掉这场
// 对话。刻意不做「原地重试」——'start' 分支的重试没有退避（agent.ts:169-171
// 对发起方每 tick 都会重来），LLM 持续不可用时会变成 1 秒一次的紧密循环。

import { Agent } from './agent';
import { agentInputs } from './agentInputs';
import { Conversation } from './conversation';
import { Game } from './game';
import { GameId } from './ids';
import { World } from './world';

const AGENT = 'a:0' as GameId<'agents'>;
const AGENT_PLAYER = 'p:0' as GameId<'players'>;
const OTHER = 'p:1' as GameId<'players'>;
const CONVO = 'c:0' as GameId<'conversations'>;
const OP = 'o:7';
const T0 = 1_000_000;

function serializedPlayerFor(id: string, human?: string) {
  return {
    id,
    human,
    lastInput: T0,
    position: { x: 10, y: 10 },
    facing: { dx: 1, dy: 0 },
    speed: 0,
  };
}

/** 真实 World / Agent / Conversation，只把 Game 换成薄壳。 */
function setup(opts: { operationId?: string; typingBy?: string; numMessages?: number } = {}) {
  const world = new World({
    nextId: 20,
    players: [serializedPlayerFor(AGENT_PLAYER), serializedPlayerFor(OTHER, 'token-human')],
    agents: [
      {
        id: AGENT,
        playerId: AGENT_PLAYER,
        inProgressOperation:
          opts.operationId === undefined
            ? undefined
            : { name: 'agentGenerateMessage', operationId: opts.operationId, started: T0 },
      },
    ],
    conversations: [
      {
        id: CONVO,
        creator: AGENT_PLAYER,
        created: T0,
        numMessages: opts.numMessages ?? 0,
        isTyping: opts.typingBy
          ? { playerId: opts.typingBy, messageUuid: 'uuid-1', since: T0 }
          : undefined,
        participants: [
          { playerId: AGENT_PLAYER, invited: T0, status: { kind: 'participating' as const, started: T0 } },
          { playerId: OTHER, invited: T0, status: { kind: 'participating' as const, started: T0 } },
        ],
      },
    ],
  });
  const game = { world } as unknown as Game;
  return { world, game };
}

function abandon(game: Game, now = T0 + 5000, operationId = OP) {
  return agentInputs.agentAbandonMessage.handler(game, now, {
    agentId: AGENT,
    conversationId: CONVO,
    operationId,
  });
}

describe('agentAbandonMessage', () => {
  test('清掉 inProgressOperation——角色立刻恢复自由，不必等满 ACTION_TIMEOUT', () => {
    const { world, game } = setup({ operationId: OP, typingBy: AGENT_PLAYER });

    abandon(game);

    expect(world.agents.get(AGENT)!.inProgressOperation).toBeUndefined();
  });

  test('停掉这场对话——否则对方会卡在一个永不兑现的「正在输入」上', () => {
    const { world, game } = setup({ operationId: OP, typingBy: AGENT_PLAYER });

    abandon(game);

    expect(world.conversations.has(CONVO)).toBe(false);
  });

  test('不把玩家踢出小镇，只是这场对话没聊起来', () => {
    const { world, game } = setup({ operationId: OP, typingBy: AGENT_PLAYER });

    abandon(game);

    expect(world.players.has(AGENT_PLAYER)).toBe(true);
    expect(world.players.has(OTHER)).toBe(true);
  });

  test('一句话都没说出口的对话不进「待回忆」——否则必然连带一条报错', () => {
    // Conversation.stop 原本无条件设 toRemember。但 loadConversation 是去
    // archivedConversations 里找的（memory.ts:159-165），而 saveDiff 靠「前后两版
    // world 的差集」归档（game.ts:269-282）——同一个保存窗口内建了又删的对话
    // 从未进过归档，于是 rememberConversation 必抛 `Conversation ... not found`。
    // rejectInvite 是这条路上最早的例子；LLM 失败退场让它从罕见变成常见。
    // 何况零消息的对话本来就没什么可回忆的（rememberConversation 自己也会空转返回）。
    const { world, game } = setup({ operationId: OP, typingBy: AGENT_PLAYER, numMessages: 0 });

    abandon(game);

    expect(world.agents.get(AGENT)!.toRemember).toBeUndefined();
  });

  test('已经聊出内容的对话照常进「待回忆」，与正常退出走同一条路', () => {
    const { world, game } = setup({ operationId: OP, typingBy: AGENT_PLAYER, numMessages: 3 });

    abandon(game);

    expect(world.agents.get(AGENT)!.toRemember).toBe(CONVO);
  });

  test('operationId 不匹配时什么都不做——防串号，与 agentFinishSendingMessage 同一套', () => {
    const { world, game } = setup({ operationId: 'o:999', typingBy: AGENT_PLAYER });

    abandon(game, T0 + 5000, OP);

    // 那个操作是别的、还在跑的操作，不能被这份陈旧回执清掉。
    expect(world.agents.get(AGENT)!.inProgressOperation?.operationId).toBe('o:999');
    expect(world.conversations.has(CONVO)).toBe(true);
  });

  test('agent 身上没有在跑的操作时什么都不做（重复回执要幂等，不能连累对话）', () => {
    const { world, game } = setup({ typingBy: AGENT_PLAYER });

    expect(() => abandon(game)).not.toThrow();
    expect(world.conversations.has(CONVO)).toBe(true);
  });

  test('对话已经不在了也不抛错——它可能已被别的路径停掉', () => {
    const { world, game } = setup({ operationId: OP });
    world.conversations.delete(CONVO);

    expect(() => abandon(game)).not.toThrow();
    // 对话没了，但操作位仍然必须放开，否则角色照样冻 120 秒。
    expect(world.agents.get(AGENT)!.inProgressOperation).toBeUndefined();
  });
});
