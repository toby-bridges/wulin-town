import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';
import { GameId } from '../../convex/aiTown/ids';
import { ServerGame } from '../hooks/serverGame';

const MEMORY_TYPE_LABEL: Record<string, string> = {
  conversation: '对话',
  reflection: '反思',
  relationship: '关系',
};

function ImportanceBadge({ importance }: { importance: number }) {
  const level = Math.max(0, Math.min(9, Math.round(importance)));
  return (
    <span className="font-body text-xs bg-clay-700 px-1 rounded" title={`重要度 ${importance}`}>
      重要度 {level}/9
    </span>
  );
}

// Conversation memories are stored as "Conversation with <name> at <date>: <content>"
// (see convex/agent/memory.ts rememberConversation). The relationship block already
// shows the counterpart's name in its own label, so this strips that boilerplate and
// shows only the LLM-authored content. Anchored on the actual name (rather than a
// locale-dependent date regex) and fails open: if the text doesn't match this exact
// shape, the original description is returned untouched.
function stripConversationPrefix(description: string, otherPlayerNames: string[]): string {
  const name = otherPlayerNames[0];
  if (!name) {
    return description;
  }
  const prefix = `Conversation with ${name} at `;
  if (!description.startsWith(prefix)) {
    return description;
  }
  const separator = description.indexOf(': ', prefix.length);
  return separator === -1 ? description : description.slice(separator + 2);
}

export default function CharacterState({
  worldId,
  game,
  playerId,
}: {
  worldId: Id<'worlds'>;
  game: ServerGame;
  playerId: GameId<'players'>;
}) {
  const player = game.world.players.get(playerId);
  const agent = [...game.world.agents.values()].find((a) => a.playerId === playerId);
  const agentDescription = agent && game.agentDescriptions.get(agent.id);

  const memories = useQuery(api.world.playerMemories, { worldId, playerId, numberOfItems: 20 });

  if (!player) {
    return null;
  }

  const now = Date.now();
  const activity = player.activity && player.activity.until > now ? player.activity : undefined;
  const destination = player.pathfinding?.destination;
  const thinking = agent?.inProgressOperation?.name;

  // "江湖关系": the most recent conversation with each distinct counterpart,
  // up to 5. Sourced from `conversation` memories (no dedicated `relationship`
  // memory type is ever generated today, see task-8-report.md). Sorted by
  // `_creationTime` rather than `lastAccess` — `lastAccess` is bumped whenever
  // a memory is retrieved for prompt context (see MEMORY_ACCESS_THROTTLE in
  // convex/agent/memory.ts), so it tracks "recently recalled", not "recently
  // happened"; `_creationTime` is immutable and matches this panel's existing
  // newest-first ordering.
  const conversationMemories = (memories ?? [])
    .filter((m) => m.type === 'conversation' && (m.otherPlayerNames?.length ?? 0) > 0)
    .slice()
    .sort((a, b) => b._creationTime - a._creationTime);
  const relationships: typeof conversationMemories = [];
  const seenCounterparts = new Set<string>();
  for (const m of conversationMemories) {
    const key = (m.otherPlayerNames ?? []).join('、');
    if (seenCounterparts.has(key)) {
      continue;
    }
    seenCounterparts.add(key);
    relationships.push(m);
    if (relationships.length >= 5) {
      break;
    }
  }
  // The main "记忆" list below excludes whatever's already shown above, so the
  // same conversation summary isn't rendered twice on one panel.
  const relationshipIds = new Set(relationships.map((m) => m._id));
  const otherMemories = (memories ?? []).filter((m) => !relationshipIds.has(m._id));

  return (
    <div className="box flex-grow mt-6">
      <h2 className="bg-brown-700 p-2 font-display text-2xl tracking-wider shadow-solid text-center">
        角色状态
      </h2>

      <div className="bg-brown-700 p-2 text-sm font-body flex flex-col gap-1">
        {agentDescription?.plan && (
          <div>
            <span className="text-yellow-300">目标：</span>
            {agentDescription.plan}
          </div>
        )}
        <div>
          <span className="text-yellow-300">位置：</span>
          {`(${player.position.x.toFixed(1)}, ${player.position.y.toFixed(1)})`}
          {player.speed > 0 ? ` · 移动中(${player.speed.toFixed(2)})` : ' · 静止'}
        </div>
        {destination && (
          <div>
            <span className="text-yellow-300">寻路目标：</span>
            {`(${destination.x.toFixed(1)}, ${destination.y.toFixed(1)})`}
          </div>
        )}
        {activity && (
          <div>
            <span className="text-yellow-300">活动：</span>
            {activity.emoji ? `${activity.emoji} ` : ''}
            {activity.description}
          </div>
        )}
        {thinking && (
          <div>
            <span className="text-yellow-300">思考中：</span>
            {thinking}
          </div>
        )}
      </div>

      {relationships.length > 0 && (
        <>
          <h3 className="bg-brown-700 mt-2 p-1 font-display text-lg text-center">江湖关系</h3>
          <div className="bg-brown-700 p-2 text-sm font-body flex flex-col gap-2">
            {relationships.map((m) => (
              <div key={m._id} className="border-t border-brown-600 pt-1 first:border-t-0 first:pt-0">
                <div className="text-yellow-300 text-xs mb-1">
                  和 {(m.otherPlayerNames ?? []).join('、')} 的交往
                </div>
                <p className="leading-tight">
                  {stripConversationPrefix(m.description, m.otherPlayerNames ?? [])}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="bg-brown-700 mt-2 p-1 font-display text-lg text-center">记忆</h3>
      <div className="bg-brown-700 p-2 text-sm font-body flex flex-col gap-2">
        {memories === undefined && <p className="opacity-60">加载记忆中…</p>}
        {memories && otherMemories.length === 0 && <p className="opacity-60">暂无记忆</p>}
        {memories &&
          otherMemories.map((m) => (
            <div key={m._id} className="border-t border-brown-600 pt-1 first:border-t-0 first:pt-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-yellow-300 text-xs">
                  {MEMORY_TYPE_LABEL[m.type] ?? m.type}
                </span>
                <ImportanceBadge importance={m.importance} />
              </div>
              <p className="leading-tight">{m.description}</p>
            </div>
          ))}
      </div>
    </div>
  );
}
