# 剧情引擎可观察性（v1.2）：事件横幅 + 未读红点 + 供给保障 + 题卡 + 说书人开场

## Context

v1.1 的剧情引擎（每 30 分钟江湖事件 + 每日章回回顾）在数据层运转正常，但消费者感知为零，原因有三：
(1) 唯一前端入口是「大事记」模态框，不点看不见；(2) 内容节奏（30 分钟/条、1 天/回）与访客停留
（几分钟）错配，必须"随时进来都看到当前状态"而非"等新内容诞生"；(3) 供给曾中断——LLM 欠费全灭 +
回顾每天仅一次机会且失败静默（console.log 级）。本计划分两波：
第一波 = Task 1（供给保障 F）+ Task 2（事件横幅 A + 未读红点 C）；第二波 = Task 3（章回题卡 B + 说书人开场 D）。

现状关键事实（实现者需要，不用自查）：
- 前端 `src/App.tsx` 持有 `historyModalOpen` state，「大事记」按钮在顶栏；大事记模态框内是
  `src/components/Timeline.tsx`（双 tab：剧集回顾 listRecaps + 事件流 listEvents）。
- `convex/director.ts` 已有公开查询 `listEvents`、`listRecaps`（签名与排序以现有代码为准，先读再用）、
  内部查询 `directorContext` / `recapContext`、`generateEvent`（cron 每 30 分）、`generateRecap`
  （cron 每日 UTC 15:00，一天只有一次机会）。
- 事件表 `jianghuEvents` 字段含 `title`、`description`、`highlights`、`startTime`（ms）；
  回顾表 `episodeRecaps` 字段含 `title`、`body`、`day`；worldId 均必填。
- 项目无 eslint-plugin-react-hooks，改 React 组件时 hooks 顺序自己盯。
- UI 语言全中文，像素风（现有按钮样式/字体 class 可参考 App.tsx 顶栏按钮）。

## Global Constraints（对所有任务生效）

1. **禁止一切 git 写操作**（add/commit/stash/checkout/reset/revert/push 一律不准跑）；
   也不准跑 `convex deploy`、`vercel`、`npm run reset`。提交与部署由调度者统一执行。
   只读命令（git diff/status/log、npm test、npx tsc）随意。
2. 不新增 npm 依赖；动画一律纯 CSS/tailwind。
3. 不修改 `convex/schema.ts`、`convex/crons.ts` 的调度时刻、以及 `convex/aiTown/**`。
4. 所有用户可见文案为中文。
5. 完成标准：`npm test` 全绿 + `npx tsc --noEmit` 零错误。
6. 前端对"查询未返回/无数据"（undefined / null / 空数组）必须安静降级：不渲染、不报错、不闪。
7. localStorage 读写必须包 try/catch（隐私模式下 accessor 可能直接 throw），失败时按"无记录"处理。

### Task 1: 供给保障加固（F）——回顾解析抽纯函数 + 重试 + 日志级别

**改动文件**：`convex/director.ts`、`convex/util/directorPrompt.ts`、
`convex/util/directorPrompt.test.ts`、`convex/agent/conversation.ts`（仅日志级别）。

1. 在 `convex/util/directorPrompt.ts` 新增纯函数并导出：
   `parseRecapOutput(content: string): { title: string; body: string } | null`
   —— 把 `generateRecap` 现在内联的解析逻辑原样搬入：去掉 ``` / ```json 围栏、`match(/\{[\s\S]*\}/)`、
   `JSON.parse`、校验 `title` 与 `body` 均为 string；任何一步不满足返回 null（内部 try/catch，
   JSON.parse 抛错也返回 null）。风格对齐同文件的 `parseDirectorOutput`。
2. `generateRecap` 改用 `parseRecapOutput`，并增加**重试**：把「chatCompletion 调用 + 解析」包成一次
   attempt，最多尝试 2 次；第 1 次失败（抛错或解析返回 null）时
   `console.error('[recap] attempt 1 failed, retrying in 10s:', ...)`，
   `await new Promise((r) => setTimeout(r, 10_000))` 后重试；第 2 次仍失败才放弃。
   放弃路径与现有行为一致（不写库、函数正常返回）。成功路径的 insertRecap 调用、
   sanitizeForPrompt 截断（60/600）、day 字段格式全部保持不变。
3. 日志级别整顿（只改级别与必要的文案微调，不改控制流）：
   - **升为 console.error**：generateEvent 的 catch、generateRecap 的 catch 与"解析失败/放弃"路径、
     `convex/agent/conversation.ts` 中事件注入的 catch（现约 245 行附近的 console.log）。
   - **保持 console.log**：正常跳过路径（'[director] world not running, skip'、
     '[recap] no events in last 24h, skip'）与成功日志。
4. `directorPrompt.test.ts` 为 `parseRecapOutput` 增加 ≥6 条用例：
   (a) 纯 JSON 正常解析；(b) 带 ```json 围栏；(c) JSON 前后混有说明文字；
   (d) 缺 body 字段 → null；(e) title 为数字 → null；(f) 完全不含花括号 → null。
5. 不改函数签名、cron 配置、`insertRecap` 的 args 结构。

**验证**：`npm test` 全绿（新用例在列）；`npx tsc --noEmit` 干净。

### Task 2: 事件横幅（A）+ 大事记未读红点（C）

**改动文件**：`src/components/EventBanner.tsx`（新建）、`src/App.tsx`、`convex/director.ts`（仅新增一个查询）。

1. `convex/director.ts` 新增公开查询 `latestActivity`：
   args `{ worldId: v.id('worlds') }`，返回
   `{ latestEventTime: number | null, latestRecapTime: number | null, latestEvent: { title: string, description: string } | null }`。
   实现：jianghuEvents 按现有 `worldTime` 索引取该 world 最新一条（startTime 作 latestEventTime，
   并回传其 title/description）；episodeRecaps 按现有索引取该 world 最新一条（`_creationTime` 作
   latestRecapTime）。表为空时对应字段为 null。**一个查询喂横幅+红点两个消费者**，不动 listEvents/listRecaps。
2. `src/components/EventBanner.tsx`：props 接 `worldId` 与 `onOpenTimeline: () => void`。
   内部 `useQuery(api.director.latestActivity, ...)`；`latestEvent` 为 null/undefined 时返回 null。
   渲染一条与游戏画布同宽的横幅：`📜 江湖近闻：《{title}》{description}`，单行截断
   （`truncate`/ellipsis），深色半透明底 + 现有像素风字体，整条可点击（cursor-pointer，
   onClick 调 `onOpenTimeline`），有 hover 反馈。移动端不破版（w-full + truncate）。
3. `src/App.tsx`：在游戏画布容器正上方挂 `<EventBanner worldId={...} onOpenTimeline={() => setHistoryModalOpen(true)} />`
   （worldId 未就绪时不渲染）。
4. 红点（C）：「大事记」按钮右上角挂未读红点（绝对定位小圆点，红底，约 w-3 h-3，带一点
   动画如 animate-pulse 可选）。逻辑：
   `unread = max(latestEventTime ?? 0, latestRecapTime ?? 0) > Number(localStorage['wulin:timelineSeenAt'] ?? 0)`。
   打开大事记模态框的一切路径（按钮、横幅点击）都要：写 `localStorage['wulin:timelineSeenAt'] = String(Date.now())`
   并即时熄灭红点（state 驱动，不靠刷新）。localStorage 全部 try/catch（读失败当 0，写失败忽略）。
5. App.tsx 里 latestActivity 只订阅一次（App 层 useQuery 一次，把数据分发给横幅与红点；
   或横幅自查+App 只管红点——二选一，但**同一查询不得订阅两次**）。

**验证**：`npx tsc --noEmit` 干净；`npm test` 全绿（不要求新增前端测试）；
报告里写清 hooks 顺序自查结论（条件 return 之前不得有条件 hooks）。

### Task 3: 章回题卡（B）+ 说书人开场（D）——第二波，依赖 Task 2 的 latestActivity

**改动文件**：`src/components/EventTitleCard.tsx`（新建）、`src/components/StorytellerIntro.tsx`（新建）、
`src/App.tsx`；如需回顾正文，用现有 `listRecaps`。

1. `EventTitleCard`（B）：props 接 `worldId`。订阅 `latestActivity`。用 useRef 记录**首次拿到数据时**
   的 latestEventTime（初始加载不弹卡）；此后 latestEventTime 变大 → 弹题卡并更新 ref；同一时间戳
   只弹一次。题卡内容：小字「⚡ 江湖突发」+ 大字《title》+ description（截 60 字，按 code point
   截断用 `[...str].slice()`）。样式：屏幕上三分之一居中覆盖卡（absolute 定位在游戏容器内，
   z-index 高于画布低于模态框），纸张/牌匾感（深底、金字或仿宣纸底、边框），CSS 过渡：淡入+轻微放大
   进场，5 秒后自动淡出（setTimeout + 状态），点击卡体立即关闭。卡外区域不拦截点击
   （覆盖层本身 pointer-events-none，卡体 pointer-events-auto）。组件卸载时清理 timer。
2. `StorytellerIntro`（D）：props 接 `worldId` 与 `onClose`。用 `listRecaps` 取最新一条回顾；
   若不存在 → 立即调 onClose（渲染 null）。若
   `最新回顾._creationTime > Number(localStorage['wulin:introSeenAt'] ?? 0)`：
   渲染全屏半透明遮罩 + 居中卷轴卡：顶部小字「说书人有云」、回目标题大字、body 正文
   （max-h-[40vh] overflow-y-auto）、底部按钮「入店听书 →」；点按钮或右上 ×：
   写 `localStorage['wulin:introSeenAt'] = String(Date.now())`，调 onClose。无自动消失。
   若时间戳不新于已读 → 直接 onClose。
3. `src/App.tsx` 协调：新增 `introDone` state；`StorytellerIntro` 挂在游戏容器上层，
   `introDone === false` 时渲染；`EventTitleCard` 仅在 `introDone === true` 后挂载（避免开场与题卡叠加）。
   大事记模态框打开时题卡不需要特殊处理（z-index 模态框更高即可）。
4. 两组件对 undefined/空数据安静降级；文案全中文；纯 CSS 动画。

**验证**：`npx tsc --noEmit` 干净；`npm test` 全绿；报告写清 hooks 顺序自查结论 +
"初始加载不弹题卡、事件更新才弹"的自测方式（可临时把 ref 初始化逻辑说明清楚）。
