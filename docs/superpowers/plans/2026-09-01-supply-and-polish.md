# 供给保活 + 小修打磨（v1.3）

## Context

v1.2 上线后 4 天生产零新事件、零新回顾（8/28《比武招亲帖》后断粮）。根因是两个省钱守卫在低流量下级联成断粮机制：无访客 → 世界休眠 → generateEvent 跳过 → 当晚 generateRecap 发现"24h 内无事件"也跳过 → 访客进站永远看到几天前的旧闻。本计划第一目标是**供给保活**：访客唤醒世界时补产事件、回顾取材窗口改为"自上次回顾以来"。另捎带 6 件已分诊的小修/护栏/打磨。

已核实的现状锚点（实现者不用重查）：
- 世界唤醒路径在 `convex/world.ts`：访客心跳把 `inactive` 世界翻回 `running` 并 `startEngine`（约 :51-55 一带，具体行号以现文件为准）；`restartDeadWorlds` cron 是另一条路径（status 已是 running 的僵死引擎），**不属于**"访客到达"，不要挂钩子。
- `convex/director.ts`：`generateEvent`（internalAction，cron 每 30 分）有"world not running 跳过"守卫；`recapContext`（internalQuery）现取"过去 24h 事件"；`generateRecap` 已有 2 次重试与 `parseRecapOutput`（在 `convex/util/directorPrompt.ts`，含测试）；`insertRecap` args 含 `day`。
- 事件表 `jianghuEvents` 有 `worldTime` 索引（[worldId, startTime]）；回顾表 `episodeRecaps` 有 `worldDay` 索引，`_creationTime` 自动附加在每个索引尾部。
- `convex/util/sanitize.ts` 的截断在约 :16，按 UTF-16 `slice`；同 bug 在 `SpeechBubble.tsx` 已用 `[...text]` 修过，照搬即可；`sanitize.test.ts` 已存在。
- `convex/util/llm.ts` 约 :157 有 `console.log(body)` 把完整 system prompt 打进日志。
- 前端：`src/App.tsx` 中"模态框开着期间持续推进 timelineSeenAt"的 effect 约在 :76-90；`StorytellerIntro.tsx` 关闭时写 `wulin:introSeenAt`（存回顾 `_creationTime`）；两条水位线 key 不同互不干扰。
- 项目 eslint 已有配置（`npm run lint` 可跑），但**没有** `eslint-plugin-react-hooks`；hooks 顺序此前全靠人工自查。

## Global Constraints（所有任务）

1. **禁止一切 git 写操作**（add/commit/stash/checkout/reset/revert/push）；不跑 convex deploy / vercel / dev 服务器 / npm run reset。提交部署归调度者。
2. 除 Task C 明确允许的 `eslint-plugin-react-hooks`（devDependency）外，不新增任何 npm 依赖。
3. 不改 `convex/schema.ts`；不改 `convex/crons.ts` 的调度时刻（在现有 cron 挂新函数引用不算改时刻，但本计划不需要动它）。
4. 用户可见文案中文；日志文案沿用现有风格。
5. 完成标准：`npm test` 全绿（基线 92）+ `npx tsc --noEmit` 与 `npx tsc -p convex --noEmit` 双零错。
6. localStorage 读写 try/catch；查询空值安静降级（沿用现有模式）。

### Task 1: 供给保活（N1）+ 回目序号（S2）

**改动文件**：`convex/world.ts`、`convex/director.ts`、`convex/util/directorPrompt.ts`、`convex/util/directorPrompt.test.ts`。

A. **唤醒补产**：
1. `convex/director.ts` 新增 `generateEventIfStale`（internalAction，args `{}`）：读默认世界最新一条 jianghuEvents 的 `startTime`，若不存在或距今超过 `EVENT_STALE_MS = 2 * 60 * 60 * 1000`（导出常量），调用现有 `generateEvent` 的 handler 逻辑（直接 `await ctx.runAction(internal.director.generateEvent, {})` 即可）；否则 `console.log('[director] fresh enough, skip replenish')`。
2. `convex/world.ts` 的访客心跳把世界从 `inactive` 翻回 `running` 的那处 mutation：在状态翻转成功的同一事务内
   `await ctx.scheduler.runAfter(10_000, internal.director.generateEventIfStale, {})`。
   10 秒延迟是给访客留看开场的时间，题卡随后弹出正好接力。**只挂在 inactive→running 翻转点**（该翻转天然单赢家，OCC 去重）；`stoppedByDeveloper` 路径与 `restartDeadWorlds` 一律不挂。
3. 幂等性说明写进注释：cron 与唤醒补产撞车时，最坏两条事件间隔分钟级，`publishEvent` 会把旧的归档，无一致性问题；`generateEventIfStale` 的 staleness 复查已把这个窗口压到可忽略。

B. **回顾窗口改"自上次回顾以来"**：
4. `recapContext` 改为：先取该 world 最新一条 episodeRecaps（沿用现有索引 + `_creationTime` desc first 惯用法），`since = 最新回顾._creationTime ?? 0`；events = `worldTime` 索引上 `startTime > since` 的全部事件，**升序**，超过 30 条时取最近 30 条并 `console.log` 记被截断的条数；同时返回 `episodeNumber = 该 world 已有回顾数 + 1`（count 用 `.collect().length` 即可——该表一天最多一条，量级无忧）。
5. `generateRecap` 无需再改窗口逻辑（沿用 context.events 为空即 skip 的现行为）。

C. **回目序号（S2）**：
6. 把 generateRecap 里内联的 prompt 组装抽成 `buildRecapPrompt(eventLines: string[], episodeNumber: number): string` 放 `convex/util/directorPrompt.ts`（导出，纯函数），内容沿用现 prompt，但把回目要求改为：明确告诉说书人"这是第 {episodeNumber} 回，回目标题必须以「第{中文数字或阿拉伯数字均可，按 LLM 习惯}回」且序号为 {episodeNumber} 开头"——实现时直接注入阿拉伯数字并示例（如"第 12 回 xxx xxx"），不要让 LLM 自己编号。
7. `directorPrompt.test.ts` 补 `buildRecapPrompt` 用例 ≥3 条：含序号注入、含事件行、空 highlights 情形不炸（按实际签名设计）。

**验证**：`npx jest convex/util/directorPrompt.test.ts` 全绿；双 tsc 零错；报告写清唤醒钩子挂点的 file:line 与"为什么这个翻转点天然去重"的一句话论证。

### Task 2: sanitize 截断修正（S1）+ llm 日志止血（E2）

**改动文件**：`convex/util/sanitize.ts`、`convex/util/sanitize.test.ts`、`convex/util/llm.ts`。

1. S1：`sanitizeForPrompt` 的截断由 UTF-16 `slice` 改为按 code point（`[...text].slice(0, maxLength).join('')`），与 `SpeechBubble.tsx` 的既有修法一致；`sanitize.test.ts` 补 2 条用例：emoji 恰好压在截断边界时不产出孤立代理（`�` 或半个代理对）、纯 BMP 中文行为与旧实现一致。
2. E2：`convex/util/llm.ts` 约 :157 的 `console.log(body)` 改为紧凑摘要：模型名、消息条数、内容总字符数（如 `console.log(\`[llm] model=\${..} messages=\${..} chars=\${..}\`)`），不再打完整 prompt。**别动重试/错误路径的日志**。

**验证**：`npx jest convex/util/sanitize.test.ts` 全绿；双 tsc 零错。

### Task 3: hooks 护栏（E1）+ 说书人 a11y（P1）+ 开场重演缝隙（P2）——第二波，等 Task 1/2 落地后单独跑

**改动文件**：`package.json`+`package-lock.json`（仅新增 `eslint-plugin-react-hooks` devDependency）、eslint 配置文件（以仓内现有格式为准）、`src/components/StorytellerIntro.tsx`、`src/App.tsx`。

1. E1：安装与仓内 eslint 大版本兼容的 `eslint-plugin-react-hooks`；配置 `react-hooks/rules-of-hooks: error`、`react-hooks/exhaustive-deps: warn`（warn 不 error：现有代码里的依赖数组取舍是有意的，先要护栏不要打断）。跑 `npm run lint`（或等价命令）：**rules-of-hooks 必须 0 error**；exhaustive-deps 的 warn 逐条列进报告（只列不修，交调度者分诊）。
2. P1：`StorytellerIntro` 补键盘可达性：(a) Esc 关闭（等价于点「入店听书」，同样写 introSeenAt）；(b) 挂载时焦点移到「入店听书」按钮；(c) Tab 在卡内两个可聚焦元素（× 与按钮）间循环（最小 focus trap，手写十几行即可，不引库）。监听器随组件卸载清理。
3. P2：`src/App.tsx` 现有"模态框开着期间推进 timelineSeenAt"的 effect 里，同步推进 introSeenAt：若 `latestRecapTime > 已存 introSeenAt` 则写 `wulin:introSeenAt = String(latestRecapTime)`（服务端时间戳，语义与 StorytellerIntro 关闭时一致）；try/catch。这样长驻访客在大事记里读过新回顾后，下次进站不再重演同一回开场。注意：introSeenAt 无对应 React state（开场只在挂载时读一次），**只写 localStorage 即可**，不需要新 state。

**验证**：双 tsc 零错；`npm test` 全绿；`npm run lint` 结果如实贴报告；hooks 顺序自查（新监听 effect 无条件执行）。
