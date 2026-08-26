import { Character } from './Character.tsx';
import { SpeechBubble } from './SpeechBubble.tsx';
import { orientationDegrees } from '../../convex/util/geometry.ts';
import { characters } from '../../data/characters.ts';
import { toast } from 'react-toastify';
import { Player as ServerPlayer } from '../../convex/aiTown/player.ts';
import { GameId } from '../../convex/aiTown/ids.ts';
import { Id } from '../../convex/_generated/dataModel';
import { Location, locationFields, playerLocation } from '../../convex/aiTown/location.ts';
import { useHistoricalValue } from '../hooks/useHistoricalValue.ts';
import { PlayerDescription } from '../../convex/aiTown/playerDescription.ts';
import { WorldMap } from '../../convex/aiTown/worldMap.ts';
import { ServerGame } from '../hooks/serverGame.ts';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useState } from 'react';

export type SelectElement = (element?: { kind: 'player'; id: GameId<'players'> }) => void;

const logged = new Set<string>();

export const Player = ({
  game,
  isViewer,
  player,
  onClick,
  historicalTime,
  worldId,
}: {
  game: ServerGame;
  isViewer: boolean;
  player: ServerPlayer;

  onClick: SelectElement;
  historicalTime?: number;
  worldId: Id<'worlds'>;
}) => {
  const playerCharacter = game.playerDescriptions.get(player.id)?.character;
  if (!playerCharacter) {
    throw new Error(`Player ${player.id} has no character`);
  }
  const character = characters.find((c) => c.name === playerCharacter);

  const locationBuffer = game.world.historicalLocations?.get(player.id);
  const historicalLocation = useHistoricalValue<Location>(
    locationFields,
    historicalTime,
    playerLocation(player),
    locationBuffer,
  );

  // 头顶气泡：订阅本角色所在对话的消息，取该角色最近一条消息（15 秒内）作为气泡文本。
  // useQuery 必须在下面所有 early return 之前调用，以保证 hooks 顺序在每次渲染间保持一致。
  const conversation = [...game.world.conversations.values()].find((c) =>
    c.participants.has(player.id),
  );
  const messages = useQuery(
    api.messages.listMessages,
    conversation ? { worldId, conversationId: conversation.id } : 'skip',
  );
  // 对话正常结束时，引擎在同一次处理里把「记录最后一条消息」和「把 conversation 从
  // game.world.conversations 删掉」一起做掉，但消息落库对客户端即时可见，而 conversation
  // 消失要等到下一个引擎 tick（约 1 秒）才会同步过来——如果气泡的存在与否直接依赖上面的
  // conversation/messages 查询是否还活着，query 会在 conversation 消失的瞬间被切到 'skip'，
  // 气泡随之立刻清空，收尾的最后一句就只剩不到 1 秒可读，远达不到 15 秒。
  // 这里用一份独立于 conversation 生命周期的 state 记住"这个角色最近说的一句"及其时间戳，
  // 只要没有更新的消息把它覆盖掉，就让它自己按 15 秒计时器走完；新对话里一旦这个角色说了
  // 新的话（_creationTime 必然更新），会立刻覆盖掉旧气泡。这是 React 官方认可的
  // "渲染期间按条件调用 setState 来派生状态" 写法（不是普通的 effect 副作用）。
  const [lastSpoken, setLastSpoken] = useState<{ text: string; creationTime: number } | null>(
    null,
  );
  const myLatest = messages?.filter((m) => m.author === player.id).at(-1);
  if (myLatest && (!lastSpoken || myLatest._creationTime > lastSpoken.creationTime)) {
    setLastSpoken({ text: myLatest.text, creationTime: myLatest._creationTime });
  }
  const now = historicalTime ?? Date.now();
  const bubbleText =
    lastSpoken && now - lastSpoken.creationTime < 15_000 ? lastSpoken.text : undefined;

  if (!character) {
    if (!logged.has(playerCharacter)) {
      logged.add(playerCharacter);
      toast.error(`Unknown character ${playerCharacter}`);
    }
    return null;
  }

  if (!historicalLocation) {
    return null;
  }

  const isSpeaking = !![...game.world.conversations.values()].find(
    (c) => c.isTyping?.playerId === player.id,
  );
  const isThinking =
    !isSpeaking &&
    !![...game.world.agents.values()].find(
      (a) => a.playerId === player.id && !!a.inProgressOperation,
    );
  const tileDim = game.worldMap.tileDim;
  const historicalFacing = { dx: historicalLocation.dx, dy: historicalLocation.dy };
  return (
    <>
      <Character
        x={historicalLocation.x * tileDim + tileDim / 2}
        y={historicalLocation.y * tileDim + tileDim / 2}
        orientation={orientationDegrees(historicalFacing)}
        isMoving={historicalLocation.speed > 0}
        isThinking={isThinking}
        isSpeaking={isSpeaking}
        emoji={
          player.activity && player.activity.until > (historicalTime ?? Date.now())
            ? player.activity?.emoji
            : undefined
        }
        isViewer={isViewer}
        textureUrl={character.textureUrl}
        spritesheetData={character.spritesheetData}
        speed={character.speed}
        tint={character.tint}
        onClick={() => {
          onClick({ kind: 'player', id: player.id });
        }}
      />
      {bubbleText && (
        <SpeechBubble
          x={historicalLocation.x * tileDim + tileDim / 2}
          y={historicalLocation.y * tileDim + tileDim / 2 - 40}
          text={bubbleText}
        />
      )}
    </>
  );
};
