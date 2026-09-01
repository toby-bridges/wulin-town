import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

// 说书人开场：访客进店先听一段「上回书说到」——把最新一条剧集回顾（说书人
// 每日总结）当成开场白铺在游戏画面上，看完才进店。
//
// 只在「有一条比上次看过的更新的回顾」时出现：没有回顾、或这条已经看过，
// 都立刻 onClose 放行，绝不空转一个遮罩挡着人玩。

// 导出给 App.tsx：大事记里读到新回顾时也要推进同一条水位线（同一个 key、
// 同一套 clamp 规则）。刻意不让 App 自己写一遍字面量——两处各写一份，任何一
// 边改了 key 或改了脏值处理，开场就会静默地永远演或永远不演。
export const INTRO_SEEN_KEY = 'wulin:introSeenAt';

// localStorage 在隐私模式 / 禁用站点数据的浏览器里连读都可能抛，一律兜住：
// 读失败当作「从没看过」，最差结果是开场多演一次。
//
// clamp 到有限正数是必要的，不能直接用 Number(...)：这个值用户可手改，
// 也可能被别的脚本写脏。写进一串非数字 → NaN，而 `x > NaN` 恒为 false，
// 开场从此再也不出现——是彻底的无声失效；写进 '1e400' → Infinity 同理。
// 两个方向都由这一条兜掉（与 App.tsx 里大事记水位线的处理保持一致）。
export function readIntroSeenAt(): number {
  try {
    const parsed = Number(localStorage.getItem(INTRO_SEEN_KEY));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export default function StorytellerIntro({
  worldId,
  onClose,
}: {
  worldId?: Id<'worlds'>;
  // 「开场演完了」的唯一出口：无论是看完点走、还是压根没得演，都要调一次，
  // App 靠它决定什么时候允许章回题卡上场。
  onClose: () => void;
}) {
  const recaps = useQuery(api.director.listRecaps, worldId ? { worldId } : 'skip');
  // 只在挂载时读一次已读水位线。放 state 里而不是每次渲染重读，是为了让
  // shouldShow 在这次开场的整个生命周期里保持稳定：点「入店听书」会把水位线
  // 写成新值，若渲染期重读，组件会在被卸载前先自己判成「已读」闪一下。
  const [seenAt] = useState(readIntroSeenAt);
  // 陷阱的两端——卡里**显式**可聚焦的两个元素，按 DOM 顺序：× 在前、
  // 「入店听书」在后。注意它们不是卡内可聚焦元素的全集（见下面 cardRef）。
  const closeRef = useRef<HTMLButtonElement>(null);
  const enterRef = useRef<HTMLButtonElement>(null);
  // 卡片容器。「焦点还在不在卡内」必须问它，不能拿上面两个 ref 的清单去问：
  // 正文溢出时浏览器会给可滚动区一个隐式 tab stop，它在卡内、却不在清单里。
  const cardRef = useRef<HTMLDivElement>(null);

  // listRecaps 按 worldDay 倒序取 30 条，[0] 就是最新一回。
  const latest = recaps && recaps.length > 0 ? recaps[0] : undefined;
  const shouldShow = !!latest && latest._creationTime > seenAt;
  // 「这一刻确实在渲染开场卡」。渲染分支和下面两个 effect 共用这一个判据：
  // 监听器的存活期必须严格等于卡片的存活期，各写各的条件迟早会漂移，
  // 漂移的后果是一个挂在 document 上、却没有对应遮罩的孤儿 Esc/Tab 监听。
  const isOpen = shouldShow && !!latest;

  useEffect(() => {
    // undefined = 还在加载（或 worldId 未就绪）。这时候既不能演也不能放行，
    // 静静等着——提前 onClose 会让本来该演的开场被永久跳过。
    if (recaps === undefined) return;
    if (shouldShow) return;
    // 这个世界还没有回顾，或者最新一回已经看过 → 立刻放行。
    onClose();
  }, [recaps, shouldShow, onClose]);

  const dismiss = useCallback(() => {
    if (latest) {
      try {
        // 水位线记的是「看到了服务端时间轴上的哪一回」，不是本地墙钟。
        // 这里刻意不用 Date.now()：被比较的是服务端 _creationTime，掺进本地
        // 时钟两个方向都会坏事——客户端慢了，同一回开场每次刷新都重演；
        // 客户端快了（哪怕只快一天），接下来几回新回顾会被静默跳过。
        // 存回这条回顾自己的 _creationTime，判定就只在服务端时间轴上单调前进。
        localStorage.setItem(INTRO_SEEN_KEY, String(latest._creationTime));
      } catch {
        // 存不进去就下次进店再听一遍，不影响本次。
      }
    }
    onClose();
  }, [latest, onClose]);

  // 开场一上台就把焦点送进卡里。没有这一步，键盘 / 读屏用户的焦点还留在遮罩
  // 背后的页面顶部：既听不到这段书，Tab 还会在被遮住的按钮之间乱走。
  useEffect(() => {
    if (!isOpen) return;
    enterRef.current?.focus();
  }, [isOpen]);

  // Esc 关闭 + 最小焦点陷阱。这是手写遮罩（不是 react-modal），这两件事没人
  // 代劳，只能自己挂一个 document 级监听。
  //
  // 挂 document 而不是卡片的 onKeyDown，是因为陷阱要处理的恰恰是「焦点已经
  // 跑到卡外」这种情况——那时候卡上的 onKeyDown 根本收不到事件，陷阱就是空的。
  //
  // hook 本身无条件执行（渲染间的 hooks 顺序不变），只在函数体里按 isOpen
  // 早退：开场没在演的时候不能留一个全局 Esc 监听，那会去关一个不存在的遮罩，
  // 也会和页面上真正在前台的东西（比如大事记的 react-modal）抢键盘。
  // isOpen 进依赖数组，所以它一翻假，cleanup 会自然把监听摘掉。
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Esc 与点「入店听书」完全等价，走同一个 dismiss：一样写水位线、
        // 一样放行。只关不写会让同一回开场下次进店再演一遍。
        dismiss();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = [closeRef.current, enterRef.current].filter(
        (el): el is HTMLButtonElement => el !== null,
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      // 「在不在卡内」问的是卡片容器的 contains，**不是**「是不是上面两颗按钮
      // 之一」。差别只在正文溢出的时候，但那时差别是致命的：Chrome / Firefox
      // 会给可滚动的正文区一个隐式 tab stop，它确实在卡内、却不在 focusables
      // 里。若拿清单当卡内判据，滚动区会被误判成「焦点跑出去了」而被劫持回
      // first(×)，Tab 于是退化成 × ↔ 滚动区 的二循环，「入店听书」正向 Tab
      // 永远到不了——恰好把这个陷阱要保护的主操作锁在外面。
      if (!cardRef.current?.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      // 焦点在卡内：只在两端接管，把 Tab 卷回另一端。中间的落点（正文滚动区，
      // 以及将来可能加进卡里的任何可聚焦元素）一律不劫持，交给浏览器的自然
      // 顺序走——陷阱只负责「出不去」，不负责规定卡内怎么走。
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, dismiss]);

  // 所有 hooks 都在这条 return 之上，条件分支不影响 hooks 顺序。
  // 用的是与两个 effect 同一个 isOpen；后面的 `|| !latest` 纯粹是给 TS 收窄
  // 用的（isOpen 是 boolean，带不动 latest 的类型），不构成第二个判据。
  if (!isOpen || !latest) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="说书人开场"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4"
    >
      {/* cardRef 挂在卡片容器上（不是外层全屏遮罩）：焦点陷阱的「卡内」
          就以这个盒子为界。 */}
      <div
        ref={cardRef}
        className="relative w-full max-w-2xl border-8 border-brown-900 bg-brown-800 px-5 py-6 font-body text-brown-100 shadow-2xl sm:px-10 sm:py-8"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={dismiss}
          aria-label="关闭开场"
          title="关闭"
          className="absolute right-3 top-2 text-3xl leading-none text-brown-200 hover:text-white"
        >
          ×
        </button>

        <p className="text-center text-xs tracking-[0.4em] text-yellow-500 sm:text-sm">说书人有云</p>
        <h2 className="mt-2 text-center font-display text-3xl leading-tight game-title sm:text-5xl">
          {latest.title}
        </h2>

        {/* 正文可能很长（说书人一天的总结），给它自己的滚动区，
            别把按钮顶出屏幕外。 */}
        {/* 用固定 rem 而非 40vh：vh 在部分内嵌/受限视口环境下会解析成 0，
            让这个滚动容器塌成零高——滚动条轨道随之消失、没法拖动（线上实测
            v1.2/v1.3 均可测得 maxHeight:0px 的塌陷值）。16rem 不依赖视口。 */}
        <div className="mt-5 max-h-64 overflow-y-auto whitespace-pre-wrap text-base leading-relaxed sm:text-lg">
          {latest.body}
        </div>

        <div className="mt-6 flex justify-center">
          {/* 焦点由上面的 effect 送到这颗按钮上。原来这里挂的是 autoFocus，
              现在移除了：焦点陷阱本来就要拿着 ref 管焦点，两套机制并存只会
              互相盖，出了问题也说不清是谁聚的。 */}
          <button
            ref={enterRef}
            type="button"
            onClick={dismiss}
            className="border-2 border-yellow-600/80 bg-clay-700 px-6 py-2 text-lg text-white shadow-solid hover:bg-clay-500 sm:text-xl"
          >
            入店听书 →
          </button>
        </div>
      </div>
    </div>
  );
}
