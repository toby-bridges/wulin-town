import { useRef, useState } from 'react';
import PixiGame from './PixiGame.tsx';

import { useElementSize } from 'usehooks-ts';
import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex, useQuery } from 'convex/react';
import PlayerDetails from './PlayerDetails.tsx';
import { api } from '../../convex/_generated/api';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { DebugTimeManager } from './DebugTimeManager.tsx';
import { GameId } from '../../convex/aiTown/ids.ts';
import { useServerGame } from '../hooks/serverGame.ts';
import { Viewport } from 'pixi-viewport';

export const SHOW_DEBUG_UI = !!import.meta.env.VITE_SHOW_DEBUG_UI;

export default function Game() {
  const convex = useConvex();
  const [selectedElement, setSelectedElement] = useState<{
    kind: 'player';
    id: GameId<'players'>;
  }>();
  const [gameWrapperRef, { width = 0, height = 0 }] = useElementSize();
  const viewportRef = useRef<Viewport | undefined>();

  const handleZoom = (direction: 'in' | 'out') => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const currentScale = viewport.scale.x;
    const newScale = direction === 'in' ? currentScale * 1.3 : currentScale / 1.3;
    viewport.animate({ scale: Math.max(0.3, Math.min(4, newScale)), time: 200 });
  };

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;

  const game = useServerGame(worldId);

  // Send a periodic heartbeat to our world to keep it alive.
  useWorldHeartbeat();

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime, timeManager } = useHistoricalTime(worldState?.engine);

  const scrollViewRef = useRef<HTMLDivElement>(null);

  if (!worldId || !engineId || !game) {
    return (
      <div className="mx-auto w-full max-w min-h-[480px] game-frame flex items-center justify-center">
        <div className="text-center p-8">
          <div className="mb-4">
            <div className="inline-block w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-white text-xl font-body">正在加载同福客栈...</p>
          <p className="text-gray-400 text-sm mt-2">请稍候，客栈正在准备迎接您</p>
        </div>
      </div>
    );
  }
  return (
    <>
      {SHOW_DEBUG_UI && <DebugTimeManager timeManager={timeManager} width={200} height={100} />}
      <div className="mx-auto w-full max-w grid grid-rows-[240px_1fr] lg:grid-rows-[1fr] lg:grid-cols-[1fr_auto] lg:grow max-w-[1400px] min-h-[480px] game-frame">
        {/* Game area */}
        <div className="relative overflow-hidden bg-brown-900" ref={gameWrapperRef}>
          <div className="absolute inset-0">
            <div className="container">
              <Stage width={width} height={height} options={{ backgroundColor: 0x2d1810 }}>
                {/* Re-propagate context because contexts are not shared between renderers.
https://github.com/michalochman/react-pixi-fiber/issues/145#issuecomment-531549215 */}
                <ConvexProvider client={convex}>
                  <PixiGame
                    game={game}
                    worldId={worldId}
                    engineId={engineId}
                    width={width}
                    height={height}
                    historicalTime={historicalTime}
                    setSelectedElement={setSelectedElement}
                    viewportRef={viewportRef}
                  />
                </ConvexProvider>
              </Stage>
            </div>
          </div>
          {/* 缩放按钮 */}
          <div className="absolute bottom-4 left-4 flex flex-col gap-2 z-10">
            <button
              onClick={() => handleZoom('in')}
              className="w-10 h-10 bg-brown-800 hover:bg-brown-700 text-white rounded-lg border-2 border-brown-600 text-xl font-bold shadow-lg"
            >
              +
            </button>
            <button
              onClick={() => handleZoom('out')}
              className="w-10 h-10 bg-brown-800 hover:bg-brown-700 text-white rounded-lg border-2 border-brown-600 text-xl font-bold shadow-lg"
            >
              −
            </button>
          </div>
        </div>
        {/* Right column area */}
        <div
          className="flex flex-col overflow-y-auto shrink-0 px-4 py-6 sm:px-6 lg:w-96 xl:pr-6 border-t-8 sm:border-t-0 sm:border-l-8 border-brown-900  bg-brown-800 text-brown-100"
          ref={scrollViewRef}
        >
          <PlayerDetails
            worldId={worldId}
            engineId={engineId}
            game={game}
            playerId={selectedElement?.id}
            setSelectedElement={setSelectedElement}
            scrollViewRef={scrollViewRef}
          />
        </div>
      </div>
    </>
  );
}
