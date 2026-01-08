# PITFALLS（踩坑与修复日志）

> 目的：记录我在开发/部署 武林小镇(wulin-town) 项目过程中踩过的坑：现象 → 根因 → 修复 → 验证 → 预防。
> 受众：零基础新手（含未来的我）。
> 规则：不写密钥；可分享；可复现；每条必须带验证步骤。

---

## 快速索引（最近 20 条）

| ID | 日期 | 标题 | 标签 | 一句话结论 |
|---|---|---|---|---|
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
2) **API/域名/路径错误**：2 次 (PIT-0001, 0003)
3) **依赖安装与版本冲突**：1 次 (PIT-0010)
4) **git 远程/权限**：1 次 (PIT-0009)
5) **框架特性不熟悉**：2 次 (PIT-0008, 0002)

---

## 日志（新记录插在最上面）

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
