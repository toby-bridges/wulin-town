import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

// 大事记面板：剧集回顾（说书人每日总结）+ 事件流（jianghuEvents 原始列表）。
// 数据源本地化——不再依赖 EverOS（townEvents action），改读 director.ts 里
// 已经维护好的 jianghuEvents / episodeRecaps 两张表。EverOS 记忆层本身没有
// 停用，只是不再是这个面板的数据源（见 convex/timeline.ts，继续给角色长期
// 记忆用，这里不碰）。
export default function Timeline({ worldId }: { worldId?: Id<'worlds'> }) {
  const [tab, setTab] = useState<'recap' | 'events'>('recap');
  const events = useQuery(api.director.listEvents, worldId ? { worldId } : 'skip');
  const recaps = useQuery(api.director.listRecaps, worldId ? { worldId } : 'skip');

  return (
    <div className="font-body text-white">
      <div className="flex gap-4 mt-4 mb-2">
        <button
          className={tab === 'recap' ? 'underline font-bold' : 'opacity-70'}
          onClick={() => setTab('recap')}
        >
          剧集回顾
        </button>
        <button
          className={tab === 'events' ? 'underline font-bold' : 'opacity-70'}
          onClick={() => setTab('events')}
        >
          事件流
        </button>
      </div>
      {tab === 'recap' && (
        <>
          {worldId && recaps === undefined && (
            <div className="mt-8 flex flex-col items-center">
              <div className="inline-block w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-3 text-gray-400">正在翻阅客栈的旧账本...</p>
            </div>
          )}
          {(!worldId || recaps?.length === 0) && (
            <p className="mt-8 text-center text-gray-400">
              说书人还没开张，今晚的戏演完就有回顾。
            </p>
          )}
          {recaps && recaps.length > 0 &&
            recaps.map((r) => (
              <div key={r._id} className="mt-4">
                <h3 className="text-2xl">{r.title}</h3>
                <p className="mt-1 opacity-90">{r.body}</p>
                <p className="text-sm opacity-50">{r.day}</p>
              </div>
            ))}
        </>
      )}
      {tab === 'events' && (
        <>
          {worldId && events === undefined && (
            <div className="mt-8 flex flex-col items-center">
              <div className="inline-block w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-3 text-gray-400">正在翻阅客栈的旧账本...</p>
            </div>
          )}
          {(!worldId || events?.length === 0) && (
            <p className="mt-8 text-center text-gray-400">客栈暂无大事，岁月静好。</p>
          )}
          {events && events.length > 0 &&
            events.map((e) => (
              <div key={e._id} className="mt-3">
                <span className={e.status === 'active' ? 'text-yellow-300' : ''}>
                  【{e.title}】
                </span>
                <span className="ml-2 opacity-90">{e.description}</span>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
