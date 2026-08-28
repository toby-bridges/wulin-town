// 章回题卡「这次该不该弹」的纯决策函数。
//
// 为什么单独抽一个模块：题卡的全部风险都在时序上——「初始加载不弹、只有事件
// 时间戳变大才弹、同一时间戳只弹一次」。真实环境里事件每 30 分钟才产一条，
// 守着浏览器等一条新事件来验证这三条规则并不现实，所以把判定搬到一个不碰
// React 的纯函数里，用例直接把三种时序摆出来跑。
//
// 刻意做成 .ts 而不是从 EventTitleCard.tsx 里导出：本仓 jest 只有
// ts-jest/presets/default-esm，没有 jsdom、没有 testing-library，且本任务禁止
// 新增依赖——测试文件一旦 import 到 .tsx（连带 react / convex/react）就跑不起来。
export type BaselineDecision = {
  /** 这次是否应该弹题卡 */
  show: boolean;
  /** 写回 ref 的新基线；null 表示「还没拿到过数据」 */
  seen: number | null;
};

export function nextBaseline(
  prevSeen: number | null,
  incoming: number | null | undefined,
): BaselineDecision {
  // undefined = 查询还没返回（或 worldId 未就绪）。这是「还不知道」，不是答案：
  // 一旦把它当成 0 记进基线，等真数据到达时就会被判成「时间戳变大了」，
  // 刷新页面必弹一张 30 分钟前的旧事件题卡。
  if (incoming === undefined) return { show: false, seen: prevSeen };
  // null = 这个世界确实一条事件都没有，是个确定答案，可以当基线 0 落下。
  const time = incoming ?? 0;
  // 首次拿到数据只记基线、不弹卡：页面刚打开时最新事件多半是很久以前的，
  // 弹出来是假的「突发」。
  if (prevSeen === null) return { show: false, seen: time };
  // 同一时间戳不重复弹（latestActivity 会因为别的字段变化而重推）。
  // 变小的情况（同一世界里时间倒流）属于异常，保持高水位、保持沉默——
  // 换世界这条正常路径已经由组件里的 worldId 重置 effect 把基线清成 null 了。
  if (time <= prevSeen) return { show: false, seen: prevSeen };
  return { show: true, seen: time };
}
