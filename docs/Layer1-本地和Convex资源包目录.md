# 武林小镇 (wulin-town) - 本地和 Convex 资源包目录

> 文档级别：Layer 1
> 版本：1.1
> 日期：2026-01-07
> 状态：待用户审核

---

## 一、资源分类原则

| 存储位置 | 存放内容 | 特点 | 容量限制 |
|----------|----------|------|----------|
| **本地静态资源** | 图片、音乐、精灵图、字体 | 不变的、部署时打包 | < 200MB（建议） |
| **Convex 数据库** | 对话记录、记忆、游戏状态 | 动态的、运行时生成 | < 500MB（安全边际） |
| **环境变量** | API 密钥、配置参数 | 敏感信息、不入代码库 | - |

---

## 二、环境变量配置

### 2.1 配置文件位置

```
项目根目录/
├── .env.local              # 本地开发环境（不提交到 Git）
└── Convex Dashboard        # 生产环境变量（在 Convex 后台配置）
```

### 2.2 必需环境变量

| 变量名 | 用途 | 示例值 | 状态 |
|--------|------|--------|------|
| `CONVEX_DEPLOYMENT` | Convex 部署标识 | `dev:patient-falcon-551` | ✅ 已配置 |
| `VITE_CONVEX_URL` | Convex API 地址 | `https://xxx.convex.cloud` | ✅ 已配置 |
| `LLM_API_URL` | 硅基流动 API 地址 | `https://api.siliconflow.cn/v1` | ⏳ 待配置 |
| `LLM_API_KEY` | 硅基流动 API 密钥 | `sk-xxx` | ⏳ 待配置 |
| `LLM_MODEL` | 对话模型名称 | `deepseek-v3` 或 `qwen-xxx` | ⏳ 待配置 |
| `JINA_API_KEY` | Jina Embedding 密钥 | `jina_xxx` | ⏳ 待配置 |

### 2.3 可选环境变量

| 变量名 | 用途 | 默认值 |
|--------|------|--------|
| `LLM_EMBEDDING_MODEL` | Embedding 模型 | 使用 Jina 则不需要 |
| `NUM_MEMORIES_TO_SEARCH` | 搜索记忆数量 | 3 |

### 2.4 .env.local 模板

```bash
# Convex 配置（已有）
CONVEX_DEPLOYMENT=dev:patient-falcon-551
VITE_CONVEX_URL=https://patient-falcon-551.convex.cloud

# 硅基流动 LLM 配置（待填写）
LLM_API_URL=https://api.siliconflow.cn/v1
LLM_API_KEY=你的硅基流动API密钥
LLM_MODEL=deepseek-v3

# Jina Embedding 配置（待填写）
JINA_API_KEY=你的Jina API密钥
```

---

## 三、本地静态资源目录

```
public/
│
├── favicon.ico                         # 网站图标 ⚠️可选替换
│
└── wulin-town/
    └── assets/
        │
        ├── 32x32folk.png               # 角色精灵图合集 ✅已有
        ├── player.png                  # 玩家精灵图 ✅已有
        ├── background.mp3              # 背景音乐 ⏳待替换
        │
        ├── fonts/                      # 字体文件
        │   ├── upheaval_pro.ttf        # 英文像素字体 ✅已有
        │   ├── vcr_osd_mono.ttf        # 英文像素字体 ✅已有
        │   └── [中文字体].ttf          # 中文字体 ⏳待决定
        │
        ├── spritesheets/               # 场景动画精灵图
        │   ├── campfire.png            # 篝火动画 ✅已有
        │   ├── gentlesparkle32.png     # 闪光效果 ✅已有
        │   ├── gentlewaterfall32.png   # 水流效果 ✅已有
        │   └── windmill.png            # 风车动画 ✅已有
        │
        ├── maps/                       # 地图资源
        │   ├── magecity.png            # 场景背景图 ✅已有
        │   ├── rpg-tileset.png         # RPG 瓦片集 ✅已有
        │   └── tilemap.json            # 地图配置 ✅已有
        │
        ├── portraits/                  # 角色头像（待添加）
        │   ├── tong-xiangyu.jpg        # 佟湘玉 ⏳待提供
        │   ├── bai-zhantang.jpg        # 白展堂 ⏳待提供
        │   ├── guo-furong.jpg          # 郭芙蓉 ⏳待提供
        │   ├── lv-xiucai.jpg           # 吕秀才 ⏳待提供
        │   ├── li-dazui.jpg            # 李大嘴 ⏳待提供
        │   ├── mo-xiaobei.jpg          # 莫小贝 ⏳待提供
        │   ├── xing-butou.jpg          # 邢捕头 ⏳待提供
        │   ├── zhu-wushuang.jpg        # 祝无双 ⏳待提供
        │   └── yan-xiaoliu.jpg         # 燕小六 ⏳待提供
        │
        └── ui/                         # UI 元素
            ├── heart-empty.png         # 心形图标 ✅已有
            └── [其他图标]              # 可选
```

---

## 四、数据配置文件目录

```
data/
│
├── characters.ts                       # 角色配置（identity, plan）✅已有
├── gentle.js                           # 地图数据配置 ✅已有
│
└── spritesheets/                       # 精灵图动画配置
    ├── f1.ts ~ f8.ts                   # 8种角色精灵图配置 ✅已有
    ├── player.ts                       # 玩家精灵图配置 ✅已有
    ├── p1.ts ~ p3.ts                   # 其他精灵图配置 ✅已有
    └── types.ts                        # 类型定义 ✅已有
```

---

## 五、Convex 数据库结构

```
Convex 数据库
│
├── worlds                              # 世界状态
│   ├── players[]                       # 玩家列表
│   ├── agents[]                        # AI代理列表
│   └── conversations[]                 # 当前对话列表
│
├── playerDescriptions                  # 玩家描述
│   ├── playerId
│   ├── name                            # 角色名
│   ├── description                     # 角色描述
│   └── character                       # 精灵图编号
│
├── agentDescriptions                   # AI代理描述
│   ├── agentId
│   ├── identity                        # 身份描述（prompt）
│   └── plan                            # 当前目标
│
├── messages                            # 对话消息
│   ├── conversationId
│   ├── author                          # 发送者
│   ├── text                            # 消息内容
│   └── _creationTime                   # 时间戳
│
├── memories                            # 角色记忆
│   ├── playerId
│   ├── description                     # 记忆描述
│   ├── importance                      # 重要性评分 (0-9)
│   ├── lastAccess                      # 最后访问时间
│   └── data                            # 记忆类型和关联
│       ├── type: "conversation"        # 对话记忆
│       └── type: "reflection"          # 反思记忆
│
├── memoryEmbeddings                    # 记忆向量
│   ├── playerId
│   └── embedding[]                     # 向量数据
│
├── archivedConversations               # 已归档对话
│
├── archivedPlayers                     # 已归档玩家
│
├── participatedTogether                # 对话参与记录
│
└── music                               # 音乐记录
    ├── storageId
    └── type                            # background | player
```

---

## 六、资源状态汇总

### 6.1 本地静态资源

| 资源类型 | 文件数 | 状态 | 预估大小 |
|----------|--------|------|----------|
| 角色精灵图 | 2 | ✅ 已有 | ~500KB |
| 场景动画 | 4 | ✅ 已有 | ~200KB |
| 地图资源 | 3 | ✅ 已有 | ~1MB |
| 字体文件 | 2 | ✅ 已有（英文） | ~100KB |
| UI元素 | 1 | ✅ 已有 | ~10KB |
| 背景音乐 | 1 | ⏳ 待替换 | ~10MB |
| 角色头像 | 0/9 | ⏳ 待提供 | ~5MB |
| favicon | 1 | ⚠️ 可选替换 | ~10KB |
| **合计** | - | - | **~17MB** |

### 6.2 环境变量

| 类型 | 数量 | 状态 |
|------|------|------|
| Convex 配置 | 2 | ✅ 已配置 |
| LLM API 配置 | 3 | ⏳ 待配置 |
| Jina API 配置 | 1 | ⏳ 待配置 |

### 6.3 Convex 数据库（运行时）

| 数据类型 | 预估增长 | 说明 |
|----------|----------|------|
| 对话消息 | ~1KB/条 | 每条消息约100字 |
| 记忆 | ~2KB/条 | 包含描述和元数据 |
| 记忆向量 | ~4KB/条 | 1536维向量 |
| 世界状态 | ~10KB | 相对固定 |

**预估**：每天 100 条对话 ≈ 每天 ~700KB 增长

---

## 七、待决定事项

| 事项 | 选项 | 影响 |
|------|------|------|
| 中文字体 | 添加 / 不添加 | 界面中文显示效果 |
| favicon | 替换 / 保留 | 浏览器标签页图标 |
| 场景动画 | 保留 / 替换 | 地图视觉效果 |

---

## 八、文件命名规范

### 8.1 角色相关

| 中文名 | 英文文件名 | 用于 |
|--------|-----------|------|
| 佟湘玉 | tong-xiangyu | 头像、配置 |
| 白展堂 | bai-zhantang | 头像、配置 |
| 郭芙蓉 | guo-furong | 头像、配置 |
| 吕秀才 | lv-xiucai | 头像、配置 |
| 李大嘴 | li-dazui | 头像、配置 |
| 莫小贝 | mo-xiaobei | 头像、配置 |
| 邢捕头 | xing-butou | 头像、配置 |
| 祝无双 | zhu-wushuang | 头像、配置 |
| 燕小六 | yan-xiaoliu | 头像、配置 |

### 8.2 命名规则

- 使用**小写英文**
- 单词间用**短横线** `-` 连接
- 避免空格和中文字符

---

## 九、资源提供清单

### 必需资源（第一阶段）

| 序号 | 资源 | 格式 | 状态 |
|------|------|------|------|
| 1 | 硅基流动 API 密钥 | 文本 | ⏳ 待提供 |
| 2 | Jina API 密钥 | 文本 | ⏳ 待提供 |
| 3 | 背景音乐 | MP3, < 10MB | ⏳ 待提供 |
| 4 | 9个角色头像 | JPG/PNG, 200x200~400x400 | ⏳ 待提供 |

### 可选资源（后续阶段）

| 序号 | 资源 | 格式 | 状态 |
|------|------|------|------|
| 1 | 中文字体 | TTF/OTF | ⏳ 可选 |
| 2 | 自定义 favicon | ICO/PNG | ⏳ 可选 |
| 3 | 自定义场景地图 | PNG | ⏳ 可选 |
| 4 | 自定义精灵图 | PNG | ⏳ 可选 |

---

*文档版本 1.1 - 补充环境变量、字体、动画、地图资源*
