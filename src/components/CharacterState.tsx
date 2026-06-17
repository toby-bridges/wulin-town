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

      <h3 className="bg-brown-700 mt-2 p-1 font-display text-lg text-center">记忆</h3>
      <div className="bg-brown-700 p-2 text-sm font-body flex flex-col gap-2">
        {memories === undefined && <p className="opacity-60">加载记忆中…</p>}
        {memories && memories.length === 0 && <p className="opacity-60">暂无记忆</p>}
        {memories &&
          memories.map((m) => (
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
