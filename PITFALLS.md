# PITFALLS（踩坑与修复日志）

> 目的：记录我在开发/部署 武林小镇(wulin-town) 项目过程中踩过的坑：现象 → 根因 → 修复 → 验证 → 预防。
> 受众：零基础新手（含未来的我）。
> 规则：不写密钥；可分享；可复现；每条必须带验证步骤。

---

## 快速索引（最近 20 条）

| ID | 日期 | 标题 | 标签 | 一句话结论 |
|---|---|---|---|---|
| PIT-0017 | 2026-09-01 | action 里的外部调用不 try/catch，角色占着操作位冻满超时 | 引擎, llm, 可靠性 | 「操作位+超时清理」模式里超时是兜底不是常规路径，每个能抛的调用都要有显式失败回执 |
| PIT-0016 | 2026-09-01 | 「闲置超时」读的字段全仓库只有一处写入，退化成固定会话计时器 | 引擎, 玩家, 生命周期 | 见到超时判据先 grep 它读的字段有几处写入；只有 1 处 = 它不是超时是定时炸弹 |
| PIT-0015 | 2026-08-28 | 换碰撞数据时站在新墙格里的角色会永久卡死 | 地图, 碰撞, 引擎 | 改 objmap 必须同事务搬走受困角色并 kick 引擎（testing:patchMapCollision 已内置） |
| PIT-0014 | 2026-08-27 | 多 agent 共享工作区里 git stash 会卷走别人的活 | git, 并行开发 | 并行开发禁用 stash/checkout--/reset，只用显式路径提交 |
| PIT-0013 | 2026-08-27 | Convex 生成文件未提交导致干净环境构建失败 | convex, 部署, 类型 | 新增 convex 函数后必须同步提交 _generated/api.d.ts |
| PIT-0012 | 2026-08-27 | schema 里有类型定义 ≠ 库里有这种数据 | 计划, 数据 | 引用某类数据前先查库确认它真的被写入过 |
| PIT-0011 | 2026-08-27 | 单趟正则去标签可被嵌套拆分重组绕过 | 安全, 正则 | 过滤标签要用泛化删除兜底，不能只列白名单 |
| PIT-0010 | 2026-01-08 | npm 依赖冲突导致 Vercel 部署失败 | npm, vercel, 依赖 | 添加 .npmrc 配置 legacy-peer-deps=true |
| PIT-0009 | 2026-01-08 | Git 远程指向原始仓库无法推送 | git, 权限 | fork 项目需要修改 remote URL |
| PIT-0008 | 2026-01-08 | viewport.update 未挂载导致缩放动画不生效 | pixi, viewport | 必须将 viewport.update 挂载到 app.ticker |
| PIT-0007 | 2026-01-08 | 世界尺寸与图片尺寸不匹配导致左侧空白 | pixi, 地图 | worldWidth/Height 应使用图片实际尺寸 |
| PIT-0006 | 2026-01-08 | 原始动画精灵（瀑布/风车）残留 | 地图, 配置 | 清空 animatedsprites 数组 |
| PIT-0005 | 2026-01-08 | 地图配置尺寸与数组尺寸不匹配导致寻路失败 | 地图, 配置 | screenxtiles/screenytiles 必须与 bgtiles/objmap 数组实际尺寸一致 |
| PIT-0004 | 2026-01-08 | setZoom(-10) 无效的负数缩放值 | pixi, viewport | 缩放值必须是正数，使用 fitWorld() 或正数 setZoom() |
| PIT-0003 | 2026-01-07 | 地图图片文件名拼写错误 | 文件, 路径 | 仔细核对文件名，gentle-objl.png vs gentle-obj.png |
| PIT-0002 | 2026-01-07 | Convex 数据库更新后旧数据未刷新 | convex, 数据库 | 需要 resetWorld + init 重新初始化世界 |
| PIT-0001 | 2026-01-07 | 硅基流动 API 域名错误导致 401 | api, 域名 | api.siliconflow.com 不是 api.siliconflow.cn |

---

## 高频雷区 Patterns（Top 5）

1) **配置/尺寸不匹配**：4 次 (PIT-0005, 0006, 0007, 0004)
2) **"看起来对"但没和真实数据/环境核对过**：3 次 (PIT-0012, 0013, 0011) — v1.1 新增的主雷区
3) **API/域名/路径错误**：2 次 (PIT-0001, 0003)
4) **框架特性不熟悉**：2 次 (PIT-0008, 0002)
5) **git 相关**：2 次 (PIT-0009 远程权限, PIT-0014 并行开发 stash)

> v1.1（AI 小镇剧情引擎）迭代复盘：这一轮的坑几乎全部集中在第 2 类。
> 具体表现是三种"以为"：以为 schema 里定义了就有数据（0012）、以为本地 tsc 干净就能部署（0013）、以为正则加了 /g 就清理干净（0011）。
> 共同的解法是同一句话：**动手前先用真实数据/干净环境验证一次你的前提**，成本几分钟，省下的是几小时返工。

---

## 日志（新记录插在最上面）

### PIT-0017: action 里的外部调用不 try/catch，角色占着操作位冻满 ACTION_TIMEOUT
**日期**：2026-09-01
**标签**：`引擎` `llm` `可靠性`

**现象 Symptom**（生产日志实证，2026-09-01 21:05）：
```
Uncaught Error: Chat completion failed with code 403
Timing out {"name":"agentGenerateMessage","operationId":"o:119875"}
```
角色面对面站着一动不动、不说话也不离开对话，约两分钟后才恢复。

**根因 Root Cause**：
`agentOperations.ts` 的 `agentGenerateMessage` 里 `completionFn` 调用没有 try/catch。抛出后
`agentSendMessage` 永不执行，`agent.inProgressOperation` 就一直挂着——只能等 `Agent.tick` 在
`ACTION_TIMEOUT` 后清理（`agent.ts:57-63`）。那期间 `startOperation` 直接 throw
（`agent.ts:244-246`），角色对任何事都无响应。`agentRememberConversation` 同一个洞。

**关键认知**：这套「抢一个操作位 → 干活 → 回执释放」的结构里，**超时是兜底，不是常规路径**。
少写一个 catch，代价不是「这次没成功」，而是「每次失败都付满超时」。而且失败源与欠费无关：
限流(429)、瞬时 5xx、网络抖动都会走这条路。

**修复 Fix**：
1. `completionFn` 包 try/catch，失败时 `console.error` 记一行（不是 `console.log`——生产上判断
   「角色是不是在装死」靠它进告警）；
2. 新增 `agentAbandonMessage` 输入（`agentInputs.ts`）：校验 operationId 防串号 → 无条件
   `delete inProgressOperation` → 停掉这场对话（`stop` 顺带释放打字锁，对方不会卡在永不兑现的
   「正在输入」上）。**刻意不原地重试**：'start' 分支对发起方每 tick 都会重来
   （`agent.ts:169-171`），没有退避，LLM 持续不可用时会退化成 1 秒一次地捶 API。
3. `agentRememberConversation` 同样包起来，复用既有的 `finishRememberConversation` 回执
   （丢一条记忆远好过让角色装死）。

**验证 Verify**：
7 条单测覆盖回执路径（含 operationId 不匹配、无在跑操作、对话已消失三种边界）；
dev 上借尚未结清的 AstraFlow 403 做天然故障注入，日志从 `Uncaught Error` + `Timing out`
变为一行 `[agent] ... message failed` 后角色立刻脱身。

**预防 Prevention**：
新增任何 `startOperation` 的操作时，先问「这个 action 里哪一步会抛，抛了谁来释放操作位」。
没有答案就别写这个操作。

---

### PIT-0016: 「闲置超时」读的字段全仓库只有一处写入，于是退化成固定会话计时器
**日期**：2026-09-01
**标签**：`引擎` `玩家` `生命周期`

**现象 Symptom**：
访客点「互动」加入后，**恰好 5 分钟必被移出小镇**，无论他在走路、聊天还是打字；正在进行的
对话被一并掐断（`leave()` 会 `conversation.stop()`）。界面零提示，「互动」按钮悄悄弹回去。

**根因 Root Cause**：
`Player.tick` 的判据本身没错：
```ts
if (this.human && this.lastInput < now - HUMAN_IDLE_TOO_LONG) this.leave(game, now);
```
错的是 **`lastInput` 全仓库只有一处写入**——`Player.join` 内（`player.ts`）。9 个 inputHandler
（moveTo / startConversation / startTyping / finishSendingMessage / acceptInvite / rejectInvite /
leaveConversation / join / leave）一个都不更新它。于是这个「闲置超时」从来没有度量过闲置，
它度量的是「加入至今」——是个伪装成 idle timeout 的固定会话计时器。

**修复 Fix**：
新增 `notePlayerActivity(players, args, now)`（`player.ts`，纯函数），挂在 `Game.handleInput`
——**输入分发的唯一入口**。按「args 带 playerId 且该 player 是人类」判定，任何未来新增的
inputHandler 自动生效。刻意不逐个 handler 补一行：那治得了今天，但下一个加 handler 的人必然漏。
放在 handler 调用**之前**：handler 抛错是逐输入 catch 的（`engine/abstractGame.ts:56-64`）不回滚，
点到墙上这类被拒操作照样是「人在动」，不该让访客因此丢掉会话。

口径（用户裁定）：只认**主动操作**。页面开着但不动不算「人还在」——那需要前端心跳，是另一套机制。

**验证 Verify**：
9 条单测（含 AI 不写该字段、脏 playerId 不炸引擎、计时器只向前、真闲置仍然被踢）；
dev 上发一个真实 `moveTo` 输入，`lastInput` 从 21:39:17 前进到 21:40:16 —— 修复前它会永远
冻在 join 时刻。

**预防 Prevention**：
**看到任何「超时 / 过期 / 失活」判据，先 grep 它读的那个字段有几处写入。只有 1 处（就是初始化那处）
= 这不是超时，是定时炸弹。** 这类 bug 静默得可怕：代码读起来完全正确，测试也难发现，
因为缺陷不在判据里而在「没人喂它」。

---

### PIT-0015: 换碰撞数据时，站在新墙格里的角色会永久卡死
**日期**：2026-08-28
**标签**：`地图` `碰撞` `引擎`

**现象 Symptom**（裸 patch objectTiles 将会发生；本次靠代码裁决提前拦截，未上演）：
角色原地冻结，日志循环：findRoute 正常返回 → `tickPosition` 报 `Stopping path ... world blocked`
→ 每 60 秒一条 `Timing out pathfinding` 后周而复始，永不恢复。

**根因 Root Cause**：
- `findRoute` 只对邻格做 blocked 检查，**不检查起点**（`movement.ts:93, 117-126`）——所以寻路"成功"；
- 但同一 tick 里 `tickPosition` 用路径插值位置做碰撞检查（`player.ts:146-160`），t=now 时插值位置
  恰好就是起点格 → 起点在新墙里 → `world blocked` → 转 `waiting` → 重新寻路 → 无限循环，位置永不更新。
- 另一半风险是覆盖：引擎把地图**缓存在内存里**（每 ~30s 才重新 Game.load），且 `Player.join` 触发
  `descriptionsModified` 时会把内存里的**旧地图整行写回** maps 表（`game.ts:241-246, 332-341`）——
  裸 patch 数据库可能被悄悄冲掉。

**修复 Fix**：
`testing:patchMapCollision`（internalMutation，单事务三件事）：
1. patch maps 行的 objectTiles（数据直接 import 自 bundle 里的 `data/gentle.js`，零参数）；
2. 对站在新墙格里的角色 BFS 找最近空格搬过去（删 `pathfinding` 键、speed=0，避开其他角色 0.75 半径）；
3. 若引擎在跑则 `kickEngine`——generation 校验在 saveWorld 事务任何写入**之前**执行且整体回滚
   （`engine/abstractGame.ts:127-129, 178`），旧 action 一个字节都写不进来，零覆盖窗口、零停机。

**验证 Verify**：
- dev 执行日志：`救援 9 人：p:0:(28,22)→(28,21)，p:2:(28,13)→(27,13)，...`——9 个角色全站在新墙里；
- 补丁后观察数分钟：`world blocked` 死循环 0 次，角色移动/对话/寻路正常；连通性单测保证无封死区域。

**预防 Prevention**：
- 一切 objmap 改动都走 `patchMapCollision`（幂等可重跑），别手动改库；也不再需要 PIT-0002 的
  resetWorld 路线——那会换 worldId，把 jianghuEvents/episodeRecaps 时间线整个甩进历史。
- 附带认知：救援 BFS 会把相邻受困者搬进同一条窄道，苏醒瞬间可能出现对话双方互堵、
  日志短时间刷 `Failed to route` 的风暴，30-60 秒内由邀请/寻路超时自愈——不是卡死，无需处理。

---

### PIT-0014: 多 agent 共享工作区里 git stash 会卷走别人的活
**日期**：2026-08-27
**标签**：`git` `并行开发`

**现象 Symptom**：
v1.1 迭代时同时有三个 AI agent 在同一个工作目录里改不同文件。其中一个为了核对 eslint 基线，跑了 `git stash` 再 `git stash pop`。

同一轮里还发生了第二起、性质更隐蔽的事故：agent A 执行 `git add 自己的两个文件`，在它执行 `git commit` **之前**，agent B 执行了 `git add 自己的文件` + `git commit`。B 的提交把 A 已经放进 index 的两个文件一起带走了，提交信息只描述了 B 的改动。A 随后的 `git commit` 发现无差异，直接 no-op 退出。

**根因 Root Cause**：
两起事故是同一个病：**git 的工作区和 index 都是全局共享状态，不属于任何一个"任务"**。

- `git stash` 作用于整个工作区，会把别人未提交的改动一起卷走
- 更隐蔽的是：`git add` 和 `git commit` 是**两条命令、不是一个原子操作**。中间这个空档里，别人的 `git commit` 会把你暂存的东西一起提交掉。即使双方都规规矩矩用了显式路径，也挡不住——因为 index 只有一个

**修复 Fix**：
```bash
# 禁用：作用于整个工作区
git stash / git stash pop
git checkout -- .
git reset --hard

# 不够：显式路径 add 仍然经过共享 index，中间有空档
git add my-file.ts && git commit -m "..."

# 正确：git commit <paths> 完全绕开 index，用临时索引一步提交
git commit -m "..." -- src/my-file.ts src/my-other-file.ts
```

`git commit <paths>`（也叫 `--only` 模式）不碰共享 index，一条命令完成暂存+提交，没有可以被别人插进来的空档。

**验证 Verify**：
提交后 `git show --stat <hash>` 确认改动文件数与预期一致，没有夹带别人的文件。发现夹带了也别慌：**代码在 git 里就是安全的**，只是提交信息错位。不要为了"历史好看"去 amend 或 rebase——别人可能已经记下了那个 hash，重写只会更乱。

事故还有第三幕，也是损失最大的一幕：混合提交发生后，B 为了"把历史整理干净"，`git revert` 掉整个混合提交、再单独重新提交自己那部分。但 revert 撤销的是**整个提交**——A 的两个文件也被一起撤销了，而重新提交时只包含了 B 自己的文件。**A 已经完成并通过验证的修复就这样被静默删除了**，B 在报告里还写着"已 revert 后干净重提"，完全没意识到删了别人的东西。

恢复方式（代码没真丢，只要那个混合提交还在）：
```bash
# 从混合提交里把被误删的文件原样取回，直接写文件、不碰 index
git show <混合提交>:path/to/file.ts > path/to/file.ts
git commit -m "restore ..." -- path/to/file.ts
```

**预防 Prevention**：
- 并行任务一律用 `git commit -m "..." -- <显式路径>` 一步到位，不要分两步
- **发现自己的提交夹带了别人的文件时，什么都别做，报告给协调者**。`revert` 一个混合提交等于删除别人的工作；"整理干净"的冲动是这轮损失最大的一次操作
- 光在指令里写禁令是不够的——这轮我明确写了"只提交这一个文件"，事故照样发生了两次。**根本解法是 `git worktree` 给每个 agent 独立工作区**，代价是每份都要装 node_modules
- 事后不要试图拆分已混合的提交，成本高于收益

**我当时的错误假设**：以为"用显式路径 add"就足够隔离了
**贝叶斯更新**：并行下 git 的共享状态（工作区 + index）都是危险品，且 add/commit 非原子 40% → 95%

---

### PIT-0013: Convex 生成文件未提交导致干净环境构建失败
**日期**：2026-08-27
**标签**：`convex` `部署` `类型`

**现象 Symptom**：
本地 `npx tsc --noEmit` 一路干净，所有测试全绿，但这只是假象——干净 checkout（比如 Vercel 部署）会在类型检查阶段直接失败：
```
Property 'director' does not exist on type ...
```

**根因 Root Cause**：
新建了 `convex/director.ts`，`convex/crons.ts` 和前端都引用 `internal.director.xxx` / `api.director.xxx`。这些引用的类型来自 `convex/_generated/api.d.ts`，而这个文件是 `convex dev` **自动生成**的——它在本地被后台的 `convex dev` 悄悄更新了，但**没人把它提交进 git**。

于是本地永远是对的（工作区那份是新的），CI/部署永远是错的（仓库那份是旧的）。Vercel 跑的是 `npm run build` = `tsc && vite build`，直接卡在这里。

**修复 Fix**：
```bash
npx convex dev --once          # 重新生成
git add convex/_generated/api.d.ts
git commit -m "chore: regenerate convex api types"
```

**验证 Verify**：
```bash
git show HEAD:convex/_generated/api.d.ts | grep director   # 必须有输出
```
更彻底的验证：clone 到一个新目录、`npm install`、`npm run build`，全绿才算数。

**预防 Prevention**：
- **每次新增 convex 函数文件后，把 `_generated/api.d.ts` 一起提交**
- 给任务分配文件清单时，凡是新增 convex 函数的任务，清单里要带上这个生成文件
- 不要只信本地 tsc——它跑在被 `convex dev` 热更新过的工作区里，是"作弊"的

**我当时的错误假设**：本地 tsc 干净 = 部署能过
**贝叶斯更新**：有自动生成文件的项目，本地和 CI 的差异是常态 30% → 90%

---

### PIT-0012: schema 里有类型定义 ≠ 库里有这种数据
**日期**：2026-08-27
**标签**：`计划` `数据`

**现象 Symptom**：
计划里写"角色关系面板的数据源：已有的 `relationship` 类型记忆"，做出来面板永远是空的。

**根因 Root Cause**：
写计划时 grep 到 `convex/agent/schema.ts` 里有 `type: v.literal('relationship')`，就当成这种数据存在了。实际上：
```bash
grep -rn "'relationship'" convex/    # 只命中 schema 定义那一行
```
**没有任何代码会写这个类型的记忆**。查了 9 个角色共 432 条记忆，100% 都是 `conversation` 类型。schema 只是"允许有这种数据"，不等于"真的有"。

**修复 Fix**：
改用真实存在的 `conversation` 类型记忆——它们本来就是关系描述（"这个小贝姑娘可真是机灵鬼……我挺喜欢这小丫头的"），只是标签不同。不新增任何后端写路径。

**验证 Verify**：
```bash
npx convex run world:playerMemories '{"worldId":"<id>","playerId":"<pid>"}'
```
先确认数据到底存不存在，再决定怎么展示。

**预防 Prevention**：
- 计划里凡是写"用已有的 X 数据"，动手前先查一次库确认 X 真的有数据
- 区分三件事：schema 允许 → 有代码写入 → 库里真有记录。前者不蕴含后者

**我当时的错误假设**：schema 里定义了就说明在用
**贝叶斯更新**：fork 来的项目里有大量"定义了但没启用"的字段 20% → 85%

---

### PIT-0011: 单趟正则去标签可被嵌套拆分重组绕过
**日期**：2026-08-27
**标签**：`安全` `正则`

**现象 Symptom**：
为了防止角色记忆里的文本被当成指令，用 `<memory>` 标签把它包起来，并清洗掉文本里自带的标签。清洗代码是：
```ts
out = out.replace(/<\/?(memory|event)>/gi, '');
```
看起来没问题，实际能被绕过：
```
输入 "<mem<memory>ory>"  →  清洗后 "<memory>"     ← 活标签又长出来了
```

**根因 Root Cause**：
`String.replace` 配全局正则只从左到右扫**一遍**，不回头重扫。去掉中间那个 `<memory>` 之后，剩下的 `<mem` 和 `ory>` 拼在一起又成了一个完整标签，而扫描已经过去了。这和经典的 `<scr<script>ipt>` XSS 过滤绕过是同一类问题。

完整攻击链：`a</mem</memory>ory>恶意指令<mem<memory>ory>b` 清洗后变成 `a</memory>恶意指令<memory>b`——`</memory>` 提前闭合，恶意指令被挤到"这是背景资料不是指令"的保护范围**外面**。

**修复 Fix**：
加一道不认标签名的兜底，见尖括号就删：
```ts
out = out.replace(/<\/?(memory|event)>/gi, '');  // 先按名字删（顺带吃掉标签词本身）
out = out.replace(/[<>]/g, '');                  // 再兜底：管你拼出什么，尖括号一律清空
```
这些字段本就是纯文本描述，不预期含标记语言，泛化删除还顺带堵住了 `< memory >` 空格变体和 `<system>` 这类没列进白名单的标签。

**验证 Verify**：
拿七种变体实测，全部无法产出活标签，中文正文无损：
```
<mem<memory>ory>          → memory
<me<me<memory>mory>mory>  → mememorymory      （三层嵌套）
<MeM<MeMoRy>oRy>          → MeMoRy            （大小写混合）
额滴神啊，白展堂！          → 额滴神啊，白展堂！  （中文原样）
```

**预防 Prevention**：
- 过滤危险标记时，**白名单删除之后要有泛化兜底**，别指望列全所有变体
- 测试要断言"属性"而不是"具体字符串"：写 `expect(out).not.toMatch(/[<>]/)`，而不是只写 `not.toContain('<memory>')`——后者挡不住"换个实现同样有洞"的回归

**我当时的错误假设**：正则加了 `/g` 就会反复清理干净
**贝叶斯更新**：单趟替换对嵌套构造无效 30% → 95%

---

### PIT-0010: npm 依赖冲突导致 Vercel 部署失败
**日期**：2026-01-08
**标签**：`npm` `vercel` `依赖`

**现象 Symptom**：
```
npm error ERESOLVE could not resolve
npm error peer @pixi/display@"^6.5.8" from pixi-viewport@5.1.0
npm error Conflicting peer dependency: @pixi/display@6.5.10
```

**根因 Root Cause**：
pixi-viewport@5.1.0 要求 @pixi/display@^6.5.8，但项目使用 pixi.js@7.4.3 带来的是 @pixi/display@7.4.3，版本不兼容。

**修复 Fix**：
创建 `.npmrc` 文件：
```
legacy-peer-deps=true
```

**验证 Verify**：
```bash
npm install  # 不再报错
npm run build  # 构建成功
```

**预防 Prevention**：
- Fork 项目时，先检查 package.json 的依赖版本兼容性
- 遇到 peer dependency 冲突，优先尝试 legacy-peer-deps

**我当时的错误假设**：以为本地能跑，Vercel 就能跑
**贝叶斯更新**：本地 npm 可能有缓存/配置，部署环境是干净的 50% → 90%

---

### PIT-0009: Git 远程指向原始仓库无法推送
**日期**：2026-01-08
**标签**：`git` `权限`

**现象 Symptom**：
```
remote: Permission to a16z-infra/ai-town.git denied to toby-bridges.
fatal: unable to access 'https://github.com/a16z-infra/ai-town.git/'
```

**根因 Root Cause**：
项目是从 a16z-infra/ai-town fork/clone 来的，origin 仍指向原始仓库，没有推送权限。

**修复 Fix**：
```bash
git remote set-url origin https://github.com/你的用户名/wulin-town.git
git push -u origin main
```

**验证 Verify**：
```bash
git remote -v  # 确认指向自己的仓库
git push  # 推送成功
```

**预防 Prevention**：
- Clone/Fork 后第一时间检查 `git remote -v`
- 建立新项目时优先创建自己的仓库

---

### PIT-0008: viewport.update 未挂载导致缩放动画不生效
**日期**：2026-01-08
**标签**：`pixi` `viewport`

**现象 Symptom**：
点击缩放按钮没有反应，滚轮缩放卡住，viewport.animate() 不生效。

**根因 Root Cause**：
pixi-viewport 的 wheel({ smooth })、decelerate、animate 等功能都依赖每帧调用 viewport.update(delta)，但代码没有将其挂载到 app.ticker。

**修复 Fix**：
```typescript
// 在 create() 中添加
const updateFn = () => viewport.update(app.ticker.deltaMS);
app.ticker.add(updateFn);

// 监听销毁事件清理
viewport.on('destroyed', () => {
  app.ticker.remove(updateFn);
});
```

**验证 Verify**：
- 滚轮缩放流畅
- 点击缩放按钮有动画效果
- viewport.animate() 正常工作

**预防 Prevention**：
- 使用第三方库时，仔细阅读文档的 "Setup" 或 "Getting Started" 部分
- pixi-viewport 明确要求：viewport.update() must be called each frame

---

### PIT-0007: 世界尺寸与图片尺寸不匹配导致左侧空白
**日期**：2026-01-08
**标签**：`pixi` `地图`

**现象 Symptom**：
地图左侧有蓝色空白区域，地图没有填满视口。

**根因 Root Cause**：
- 地图图片尺寸：2528 × 1696 像素
- worldWidth/Height 使用的是：width * tileDim = 64 * 32 = 2048 × 1536
- 差了 480 × 160 像素

**修复 Fix**：
```typescript
// 使用图片实际尺寸
const worldWidth = tileSetDimX || width * tileDim;
const worldHeight = tileSetDimY || height * tileDim;
```

**验证 Verify**：
地图完整显示，无空白区域。

**预防 Prevention**：
- 使用完整地图图片时，世界尺寸应该基于图片尺寸，而非瓦片逻辑尺寸
- 区分"显示尺寸"和"逻辑尺寸"的概念

---

### PIT-0006: 原始动画精灵（瀑布/风车）残留
**日期**：2026-01-08
**标签**：`地图` `配置`

**现象 Symptom**：
地图上显示瀑布和风车动画，但用户的同福客栈地图上没有这些元素。

**根因 Root Cause**：
gentle.js 中的 animatedsprites 数组包含原始 ai-town 项目的动画配置（campfire、waterfall、windmill 等），没有清空。

**修复 Fix**：
```javascript
// gentle.js
export const animatedsprites = [];
```

**验证 Verify**：
刷新页面后，瀑布和风车消失。

**预防 Prevention**：
- Fork 项目后，检查所有资源配置是否与新主题匹配
- 建立"资源清单"对照检查

---

### PIT-0005: 地图配置尺寸与数组尺寸不匹配导致寻路失败
**日期**：2026-01-08
**标签**：`地图` `配置`

**现象 Symptom**：
```
[WARN] 'Timing out pathfinding for p:2'
[WARN] 'Timing out pathfinding for p:4'
...
```
角色无法移动，寻路超时。

**根因 Root Cause**：
- gentle.js 配置：screenxtiles=79, screenytiles=53
- bgtiles/objmap 数组实际尺寸：64 × 48
- 寻路算法按配置尺寸查找，但数组越界

**修复 Fix**：
```javascript
// gentle.js - 配置必须与数组实际尺寸匹配
export const screenxtiles = 64
export const screenytiles = 48
```

**验证 Verify**：
- 运行 resetWorld + init 重建世界
- 角色可以正常移动
- 无 "Timing out pathfinding" 警告

**预防 Prevention**：
- 修改地图配置时，用代码验证数组实际尺寸：
  ```javascript
  console.log('bgtiles cols:', bgtiles[0].length);
  console.log('bgtiles rows:', bgtiles[0][0].length);
  ```

---

### PIT-0004: setZoom(-10) 无效的负数缩放值
**日期**：2026-01-08
**标签**：`pixi` `viewport`

**现象 Symptom**：
地图显示异常，缩放不工作。

**根因 Root Cause**：
原始代码 `.setZoom(-10)` 中的 -10 是无效的负数缩放值。

**修复 Fix**：
```typescript
// 移除 setZoom(-10)，改用
viewport.fitWorld(true);
// 或
viewport.setZoom(minScale * 1.5);
```

**验证 Verify**：
地图正常显示和缩放。

**预防 Prevention**：
- 缩放值必须是正数
- 代码审查时注意"魔法数字"

---

### PIT-0003: 地图图片文件名拼写错误
**日期**：2026-01-07
**标签**：`文件` `路径`

**现象 Symptom**：
地图不显示，控制台报 404 找不到 gentle-obj.png。

**根因 Root Cause**：
用户上传的文件名是 `gentle-objl.png`（多了一个 l），但代码引用的是 `gentle-obj.png`。

**修复 Fix**：
重命名文件：
```bash
mv gentle-objl.png gentle-obj.png
```

**验证 Verify**：
文件存在且地图正常加载。

**预防 Prevention**：
- 上传文件后立即用 `ls` 或 `dir` 确认文件名
- 复制粘贴文件名而非手打

---

### PIT-0002: Convex 数据库更新后旧数据未刷新
**日期**：2026-01-07
**标签**：`convex` `数据库`

**现象 Symptom**：
修改了 gentle.js 的地图配置，但游戏中显示的还是旧地图。

**根因 Root Cause**：
`npx convex run init` 只在世界不存在时创建新世界，不会更新已存在的地图数据。

**修复 Fix**：
```bash
npx convex run testing:resetWorld  # 归档旧世界
npx convex run init                 # 创建新世界
```

**验证 Verify**：
刷新页面，看到新地图配置生效。

**预防 Prevention**：
- 修改地图/角色等初始化数据后，必须重置世界
- 可以创建一个 `npm run reset` 脚本简化操作

---

### PIT-0001: 硅基流动 API 域名错误导致 401
**日期**：2026-01-07
**标签**：`api` `域名`

**现象 Symptom**：
```
Error: 401 Unauthorized
```
API Key 确认有效，但请求失败。

**根因 Root Cause**：
代码中使用的是 `api.siliconflow.cn`，但正确域名是 `api.siliconflow.com`。

**修复 Fix**：
```typescript
// convex/util/llm.ts
const apiUrl = 'https://api.siliconflow.com/v1/chat/completions';
```

**验证 Verify**：
API 请求返回 200，LLM 正常响应。

**预防 Prevention**：
- 从官方文档复制 API endpoint，不要凭记忆
- 硅基流动官网：https://cloud.siliconflow.com/

**我当时的错误假设**：.cn 和 .com 都能用
**贝叶斯更新**：中国公司的 API 不一定用 .cn 域名 30% → 90%

---

## 成长轨迹

### 本项目总结（10 条踩坑后）

**我最常犯的错误类型**：
1. **配置/尺寸不匹配**（4次）- 多个系统间的数据需要保持一致
2. **不熟悉框架特性**（2次）- pixi-viewport 需要 update，Convex 需要 reset

**新形成的稳定规则**：
1. Fork 项目后，第一时间检查：git remote、package.json 依赖、资源配置
2. 修改配置后，用代码验证实际值是否匹配
3. 部署前在干净环境测试（或至少删除 node_modules 重装）

**下一阶段要减少的"无效折腾"**：
- 不要假设"本地能跑 = 部署能跑"
- 遇到问题先看官方文档，而非猜测

---

## 沟通复盘：与 AI 协作的改进建议

### 1. 项目背景信息 ⭐⭐⭐
**现象**：花了不少时间才理解这是 fork 自 ai-town 的项目，以及地图是"完整图片"而非"瓦片集"。

**建议**：开始时提供一段项目背景：
```
这是 fork 自 ai-town 的项目，我想改造成武林外传主题。
我有一张完整的同福客栈地图图片（不是瓦片集），尺寸是 XXX。
目标是2小时内部署上线。
```

### 2. 时间/优先级约束 ⭐⭐⭐
**现象**："2小时内上线"的约束在中后期才提出。

**建议**：一开始就说明：
- 有多少时间
- 哪些是必须的（MVP）
- 哪些可以之后再做

这样可以更好地取舍，避免在非关键问题上花太多时间。

### 3. 资源准备 ⭐⭐
**现象**：地图图片上传了几次（文件名错误、尺寸不明确）

**建议**：上传资源前确认：
- 文件名正确
- 知道图片尺寸（可以用画图软件查看）
- 告诉 AI "这是完整地图"还是"瓦片集"

### 4. 外部反馈的时机 ⭐⭐
**现象**：朋友的代码审核反馈非常有价值，帮助发现了 viewport.update 的问题。

**建议**：如果有懂技术的朋友可以帮忙审核，可以更早引入。或者提前说明"我有朋友可以帮忙 review"。

### 5. 做得好的地方 👍
- **截图反馈**：每次遇到问题都及时截图，这非常关键
- **耐心配合**：即使遇到多次问题也没有放弃
- **追问细节**：比如"key填什么，value填什么"这种追问很好，确保不出错

### 下次项目的开场模板

```
项目：[名称]
来源：[新建/fork自哪里]
目标：[一句话描述]
时间：[有多少时间]
资源：[已有什么资源，格式/尺寸]
MVP：[必须完成的功能]
Nice to have：[有时间再做的功能]
```

---

*最后更新：2026-01-08*
