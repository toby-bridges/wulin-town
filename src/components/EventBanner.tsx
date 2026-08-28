// 事件横幅：把「当前江湖近闻」直接顶到游戏画布上方。
//
// 背景：剧情事件每 30 分钟生成一条，但此前唯一入口是「大事记」模态框，
// 不点开就完全感知不到，访客眼里小镇和没有剧情引擎时一模一样。这条横幅
// 让剧情 0 秒可见，点一下就进大事记看全量。
//
// 有意做成纯展示组件（零 hooks、不自己 useQuery）：latestActivity 由
// App.tsx 统一订阅一次，同时喂横幅和「大事记」按钮上的未读红点，避免同一
// 查询在一个页面里被订阅两次。零 hooks 也让"条件 return 前不得有条件
// hooks"这条规则在这里天然成立。
type BannerEvent = { title: string; description: string };

export default function EventBanner({
  event,
  onOpenTimeline,
}: {
  // undefined = worldId 未就绪或查询还没回来；null = 这个世界还没有任何事件。
  // 两种情况都安静地不渲染，绝不占位、不报错。
  event?: BannerEvent | null;
  onOpenTimeline: () => void;
}) {
  if (!event) return null;

  return (
    // 宽度对齐 Game 的画布外框（mx-auto w-full max-w-[1400px]），移动端满宽。
    <div className="mx-auto w-full max-w-[1400px] mb-1">
      <button
        type="button"
        onClick={onOpenTimeline}
        title="查看大事记"
        className="block w-full cursor-pointer border border-white/15 bg-black/60 px-3 py-2 text-left font-body text-sm text-white transition-colors hover:border-yellow-500/60 hover:bg-black/80 sm:text-base"
      >
        {/* 单行截断：这里必须是块级单文本节点。若拆成 flex 行（emoji 一格、
            文本一格），truncate 会因为 flex 子项默认 min-width:auto 而失效。 */}
        <span className="block truncate shadow-solid">
          📜 江湖近闻：《{event.title}》{event.description}
        </span>
      </button>
    </div>
  );
}
