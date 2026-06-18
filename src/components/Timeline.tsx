import { useEffect, useState } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

type TimelineEvent = {
  text: string;
  timestamp?: number;
  participants: string[];
};

export default function Timeline({ worldId }: { worldId?: Id<'worlds'> }) {
  const townEvents = useAction(api.timeline.townEvents);
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'disabled' }
    | { kind: 'error' }
    | { kind: 'ready'; events: TimelineEvent[] }
  >({ kind: 'loading' });

  useEffect(() => {
    if (!worldId) return;
    let cancelled = false;
    setState({ kind: 'loading' });
    townEvents({ worldId })
      .then((res) => {
        if (cancelled) return;
        if (!res.enabled) {
          setState({ kind: 'disabled' });
        } else if (res.degraded) {
          setState({ kind: 'error' });
        } else {
          setState({ kind: 'ready', events: res.events });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [worldId, townEvents]);

  if (state.kind === 'loading') {
    return (
      <div className="mt-8 flex flex-col items-center">
        <div className="inline-block w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-gray-400">正在翻阅客栈的旧账本...</p>
      </div>
    );
  }
  if (state.kind === 'disabled') {
    return (
      <p className="mt-8 text-center text-gray-400">
        记忆服务未开启，暂无大事记。
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p className="mt-8 text-center text-gray-400">
        旧账本一时翻不开，稍后再来看看吧。
      </p>
    );
  }
  if (state.events.length === 0) {
    return (
      <p className="mt-8 text-center text-gray-400">
        暂无大事记，角色们正在创造新的故事...
      </p>
    );
  }
  return (
    <ol className="mt-6 relative border-l-2 border-brown-600 ml-3">
      {state.events.map((ev, i) => (
        <li key={i} className="mb-6 ml-6">
          <span className="absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full bg-yellow-500 ring-4 ring-[rgb(35,38,58)]"></span>
          {ev.timestamp != null && Number.isFinite(ev.timestamp) && (
            <time className="block text-xs text-gray-400 mb-1">
              {new Date(ev.timestamp).toLocaleString()}
            </time>
          )}
          {ev.text
            .split(/(?<=[。！？\n])/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((line, j) => (
              <p key={j} className="leading-snug mb-1 whitespace-pre-line">
                {line}
              </p>
            ))}
          {ev.participants.length > 0 && (
            <p className="mt-1 text-xs text-yellow-400">
              {ev.participants.join('、')}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
