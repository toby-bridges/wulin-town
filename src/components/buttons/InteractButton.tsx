import Button from './Button';
import { toast } from 'react-toastify';
import interactImg from '../../../assets/interact.svg';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { ConvexError } from 'convex/values';
import { Id } from '../../../convex/_generated/dataModel';
import { useCallback } from 'react';
import { waitForInput } from '../../hooks/sendInput';
import { useServerGame } from '../../hooks/serverGame';
import { useVisitorId } from '../../hooks/useVisitorId';

export default function InteractButton() {
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const game = useServerGame(worldId);
  const visitorId = useVisitorId();
  const humanTokenIdentifier = useQuery(
    api.world.userStatus,
    worldId && visitorId ? { worldId, visitorId } : 'skip',
  );
  const userPlayerId =
    game && [...game.world.players.values()].find((p) => p.human === humanTokenIdentifier)?.id;
  const join = useMutation(api.world.joinWorld);
  const leave = useMutation(api.world.leaveWorld);
  const isPlaying = !!userPlayerId;

  const convex = useConvex();
  const joinInput = useCallback(
    async (worldId: Id<'worlds'>, visitorId: string) => {
      let inputId;
      try {
        inputId = await join({ worldId, visitorId });
      } catch (e: any) {
        if (e instanceof ConvexError) {
          toast.error(e.data);
          return;
        }
        throw e;
      }
      try {
        await waitForInput(convex, inputId);
      } catch (e: any) {
        toast.error(e.message);
      }
    },
    [convex, join],
  );

  const joinOrLeaveGame = () => {
    if (!worldId || !visitorId || game === undefined) {
      return;
    }
    if (isPlaying) {
      console.log(`Leaving game for player ${userPlayerId}`);
      void leave({ worldId, visitorId });
    } else {
      console.log(`Joining game as ${visitorId}`);
      void joinInput(worldId, visitorId);
    }
  };

  return (
    <Button imgUrl={interactImg} onClick={joinOrLeaveGame}>
      {isPlaying ? '离开' : '互动'}
    </Button>
  );
}
