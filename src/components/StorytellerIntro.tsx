import { useCallback, useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

// 说书人开场：访客进店先听一段「上回书说到」——把最新一条剧集回顾（说书人
// 每日总结）当成开场白铺在游戏画面上，看完才进店。
//
// 只在「有一条比上次看过的更新的回顾」时出现：没有回顾、或这条已经看过，
// 都立刻 onClose 放行，绝不空转一个遮罩挡着人玩。

const INTRO_SEEN_KEY = 'wulin:introSeenAt';

// localStorage 在隐私模式 / 禁用站点数据的浏览器里连读都可能抛，一律兜住：
// 读失败当作「从没看过」，最差结果是开场多演一次。
//
// clamp 到有限正数是必要的，不能直接用 Number(...)：这个值用户可手改，
// 也可能被别的脚本写脏。写进一串非数字 → NaN，而 `x > NaN` 恒为 false，
// 开场从此再也不出现——是彻底的无声失效；写进 '1e400' → Infinity 同理。
// 两个方向都由这一条兜掉（与 App.tsx 里大事记水位线的处理保持一致）。
function readIntroSeenAt(): number {
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

  // listRecaps 按 worldDay 倒序取 30 条，[0] 就是最新一回。
  const latest = recaps && recaps.length > 0 ? recaps[0] : undefined;
  const shouldShow = !!latest && latest._creationTime > seenAt;

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

  // 所有 hooks 都在这条 return 之上，条件分支不影响 hooks 顺序。
  if (!shouldShow || !latest) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="说书人开场"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-4"
    >
      <div className="relative w-full max-w-2xl border-8 border-brown-900 bg-brown-800 px-5 py-6 font-body text-brown-100 shadow-2xl sm:px-10 sm:py-8">
        <button
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
        <div className="mt-5 max-h-[40vh] overflow-y-auto whitespace-pre-wrap text-base leading-relaxed sm:text-lg">
          {latest.body}
        </div>

        <div className="mt-6 flex justify-center">
          {/* autoFocus 让键盘焦点一开场就落进遮罩里（本组件是手写遮罩，没有
              react-modal 那套焦点陷阱；至少要保证按 Enter 就能进店，而不是
              把用户丢在遮罩背后的页面顶部）。 */}
          <button
            type="button"
            autoFocus
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
