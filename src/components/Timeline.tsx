import { useEffect, useRef, useState } from 'react';
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

  // 默认标签选择：generateRecap 每天只在 15:00 UTC 跑一次且要求自上次回顾
  // 以来有事件，全新世界（init --prod 刚建好）大概率暂时没有回顾。若「剧集
  // 回顾」死死占着默认标签，上线首日访客点开大事记只会看到一句空话，还
  // 不知道旁边「事件流」其实有内容。
  //
  // recaps 首次渲染必是 undefined（查询还没返回），没法在 useState 初始值
  // 那一刻就做判断，只能等数据到达后用 effect 补一次默认选择：为空则切到
  // 「事件流」，非空则保持「剧集回顾」。tabDecidedRef 保证这个自动选择只
  // 生效一次——之后无论是用户手动点过标签、还是自动逻辑已经选过一次，都
  // 不再被后续的数据更新（比如当天生成了新回顾）弹走标签。
  //
  // worldId 变化时（例如大事记弹窗开着时世界被 resetWorld+init 换掉，
  // App.tsx 不会因此重新挂载 Timeline）视为一次新的默认选择：重置标签与
  // decided 标记，避免旧世界锁定的自动选择状态错误延续到新世界。
  const tabDecidedRef = useRef(false);

  useEffect(() => {
    tabDecidedRef.current = false;
    setTab('recap');
  }, [worldId]);

  useEffect(() => {
    if (tabDecidedRef.current) return;
    if (recaps === undefined) return;
    tabDecidedRef.current = true;
    if (recaps.length === 0) {
      setTab('events');
    }
  }, [recaps]);

  const selectTab = (next: 'recap' | 'events') => {
    tabDecidedRef.current = true;
    setTab(next);
  };

  return (
    <div className="font-body text-white">
      <div className="flex gap-4 mt-4 mb-2">
        <button
          className={tab === 'recap' ? 'underline font-bold' : 'opacity-70'}
          onClick={() => selectTab('recap')}
        >
          剧集回顾
        </button>
        <button
          className={tab === 'events' ? 'underline font-bold' : 'opacity-70'}
          onClick={() => selectTab('events')}
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
