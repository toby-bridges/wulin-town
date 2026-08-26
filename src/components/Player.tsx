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
  const myLatest = messages?.filter((m) => m.author === player.id).at(-1);
  const now = historicalTime ?? Date.now();
  const bubbleText =
    myLatest && now - myLatest._creationTime < 15_000 ? myLatest.text : undefined;

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
