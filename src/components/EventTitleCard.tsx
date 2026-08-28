import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Id } from '../../convex/_generated/dataModel';
import { nextBaseline } from './eventCardBaseline';

// 章回题卡：新事件生成的那一刻，在画布上三分之一处糊一张「⚡ 江湖突发」的牌匾，
// 5 秒后自己淡走。
//
// 和事件横幅（EventBanner，常驻、给「现在演到哪」）的分工：横幅回答「有什么」，
// 题卡回答「刚刚变了」。所以题卡只在时间戳真的往前跳的那一次出现，绝不在
// 刷新页面时补演——那样它就退化成第二条横幅了。
//
// 数据同样走 props 而不是自己 useQuery(latestActivity)：App.tsx 统一订阅一次，
// 同时喂横幅、未读红点和这张题卡（第一波确立的模式）。

/** 亮相时长（毫秒），淡入结束后开始计时。 */
const SHOW_MS = 5000;
/** 淡入/淡出时长，必须和下面 className 里的 duration-500 保持一致。 */
const FADE_MS = 500;
/** description 最多显示多少个字（按 code point 数，不是 UTF-16 长度）。 */
const MAX_DESC_CHARS = 60;

type CardEvent = { title: string; description: string };

// 按 code point 截断：中文都在 BMP 内没差别，但描述里若混进 emoji（编剧 LLM
// 偶尔会写），用 string.slice 会把代理对劈成两半、渲染出半个乱码方块。
// 省略号只在真的截断时才加。
function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}

export default function EventTitleCard({
  worldId,
  latestEventTime,
  latestEvent,
}: {
  // 世界被换掉（resetWorld + init）时用来作废基线。
  worldId?: Id<'worlds'>;
  // undefined = 查询未就绪；null = 这个世界还没有任何事件。两者语义不同，
  // 判定见 nextBaseline。
  latestEventTime?: number | null;
  latestEvent?: CardEvent | null;
}) {
  // card 非空 = 现在有一张卡在台上；每次都是新对象，identity 变化就是
  // 「换了一张卡」，下面的动画 effect 靠它重跑。
  const [card, setCard] = useState<CardEvent | null>(null);
  // visible 只驱动 CSS 过渡的目标态，不决定挂不挂载。
  const [visible, setVisible] = useState(false);
  // 已经「见过」的最大事件时间戳。null = 还没拿到过任何数据。
  // 用 ref 而不是 state：它的变化不该触发渲染，而且必须在 StrictMode 的
  // 挂载→卸载→再挂载里存活下来（否则开发模式下第二次挂载会被当成初载，
  // 反而正好也是不弹卡，但语义就糊了）。
  const seenRef = useRef<number | null>(null);

  // 世界换了就把基线清空，否则旧世界的高水位会把新世界的第一条事件吞掉。
  // 必须声明在下面的探测 effect 之前：同一次提交里 effect 按声明顺序执行，
  // 先清空再重记基线，顺序反了会把新世界的第一条事件误判成「更新」弹卡。
  useEffect(() => {
    seenRef.current = null;
    setCard(null);
    setVisible(false);
  }, [worldId]);

  // 探测「事件是否更新」。判定逻辑全部在 eventCardBaseline.ts 里，有单测覆盖。
  useEffect(() => {
    const { show, seen } = nextBaseline(seenRef.current, latestEventTime);
    seenRef.current = seen;
    if (!show || !latestEvent) return;
    setCard({ title: latestEvent.title, description: latestEvent.description });
    // 和 setCard 同一批：新卡必须从「透明」开始，否则接着上一张的 opacity-100
    // 直接硬切出来，没有进场动画。
    setVisible(false);
  }, [latestEventTime, latestEvent]);

  // 一张卡的完整生命周期：淡入 → 停 5 秒 → 淡出 → 卸载。
  useEffect(() => {
    if (!card) return;
    let enterInner = 0;
    // 进场用的是 CSS transition 而不是 keyframe 动画，所以浏览器必须先画出
    // 一帧 opacity-0 的初始态，下一帧再切到 opacity-100，class 变化才会被
    // 当成「过渡」。双层 rAF 是这里最稳的写法：单层有可能和首帧提交挤在同
    // 一帧内，过渡被整帧跳过，卡片硬闪出来。
    const enterOuter = requestAnimationFrame(() => {
      enterInner = requestAnimationFrame(() => setVisible(true));
    });
    const fadeOut = setTimeout(() => setVisible(false), SHOW_MS);
    const remove = setTimeout(() => setCard(null), SHOW_MS + FADE_MS);
    // 卸载（以及点击关闭、下一张卡顶掉这张）时全部清掉，不留悬空 timer。
    return () => {
      cancelAnimationFrame(enterOuter);
      cancelAnimationFrame(enterInner);
      clearTimeout(fadeOut);
      clearTimeout(remove);
    };
  }, [card]);

  // 「点击卡体立即关闭」：直接摘掉，不走淡出。setCard(null) 会触发上面
  // effect 的 cleanup，两个 timer 一起清。
  const dismiss = () => setCard(null);

  return (
    // 覆盖层常驻但完全透明、pointer-events-none：常驻是为了让 aria-live 生效
    // （读屏用户能听到新插入的题卡），不拦截点击是为了不挡住画布上的拖拽和缩放。
    // z-20 而不是 z-10：Game 里的缩放按钮是 z-10，且它们的定位祖先没有自己的
    // 层叠上下文，会和这张卡在同一个上下文里比大小。大事记模态框走 body portal
    // （z-index 12，在 main 的 isolate 之外），永远压在题卡之上，不用特殊处理。
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 top-1/3 z-20 flex justify-center px-4"
    >
      {card && (
        <button
          type="button"
          onClick={dismiss}
          title="点击关闭"
          className={clsx(
            'w-full max-w-lg border-4 border-yellow-600/70 bg-brown-900/95 px-5 py-4 text-center font-body',
            'shadow-2xl transition duration-500 ease-out',
            visible
              ? 'pointer-events-auto scale-100 opacity-100'
              : // 淡出途中（以及进场前那一帧）不接点击：一块看不见的按钮杵在
                // 画布中央接死点是最烦人的那种 bug。
                'pointer-events-none scale-95 opacity-0',
          )}
        >
          <span className="block text-xs tracking-[0.3em] text-yellow-500 sm:text-sm">
            ⚡ 江湖突发
          </span>
          <span className="mt-2 block font-display text-2xl leading-tight text-yellow-300 shadow-solid sm:text-4xl">
            《{card.title}》
          </span>
          {card.description && (
            <span className="mt-2 block text-sm leading-snug text-brown-200 sm:text-base">
              {truncate(card.description, MAX_DESC_CHARS)}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
