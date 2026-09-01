import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery, query } from './_generated/server';
import { chatCompletion } from './util/llm';
import { sanitizeForPrompt } from './util/sanitize';
import { sleep } from './util/sleep';
import {
  buildDirectorPrompt,
  buildRecapPrompt,
  parseDirectorOutput,
  parseRecapOutput,
} from './util/directorPrompt';
import { Descriptions } from '../data/characters';

// 编剧上下文：默认世界 + 近期事件标题。世界不在运行则返回 null（省 token）。
export const directorContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .first();
    if (!worldStatus || worldStatus.status !== 'running') return null;
    const recent = await ctx.db
      .query('jianghuEvents')
      .withIndex('worldTime', (q) => q.eq('worldId', worldStatus.worldId))
      .order('desc')
      .take(3);
    return { worldId: worldStatus.worldId, recentTitles: recent.map((e) => e.title) };
  },
});

export const publishEvent = internalMutation({
  args: {
    worldId: v.id('worlds'),
    title: v.string(),
    description: v.string(),
    highlights: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const active = await ctx.db
      .query('jianghuEvents')
      .withIndex('worldStatus', (q) => q.eq('worldId', args.worldId).eq('status', 'active'))
      .collect();
    for (const e of active) {
      await ctx.db.patch(e._id, { status: 'archived', endTime: Date.now() });
    }
    await ctx.db.insert('jianghuEvents', {
      worldId: args.worldId,
      title: args.title,
      description: args.description,
      highlights: args.highlights,
      status: 'active',
      startTime: Date.now(),
    });
  },
});

// 定时编剧。全程 fail-soft：任何失败只打日志，绝不抛错。
export const generateEvent = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const context = await ctx.runQuery(internal.director.directorContext, {});
      if (!context) {
        console.log('[director] world not running, skip');
        return;
      }
      // identity 均以"你是<name>，"开头；去掉该前缀（而非固定字数 slice），
      // 因为关系类描述（暗恋谁、和谁是欢喜冤家等）常常出现在人设文本较靠后的位置，
      // 定长截断会正好切掉这些对编剧最有用的信息。9 个角色全文最长仅 137 字，
      // 整个名单远小于一次 LLM 调用的预算，因此不截断；保留 cap 只是防止未来
      // 加入的角色 identity 异常长时把 prompt 撑爆。
      const characterLines = Descriptions.map((d) => {
        const stripped = d.identity.replace(/^你是[^，]*，/, '');
        const capped = stripped.length > 200 ? stripped.slice(0, 200) + '…' : stripped;
        return `${d.name}：${capped}`;
      });
      const prompt = buildDirectorPrompt({
        characterLines,
        recentTitles: context.recentTitles,
      });
      const { content } = await chatCompletion({
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
        // 手测发现默认采样下模型偏好套用范例里的"六扇门查文书"设定，
        // 提高 temperature 增加每次生成的题材多样性（配合上面的 prompt 提醒）。
        temperature: 0.9,
      });
      const parsed = parseDirectorOutput(content);
      if (!parsed) {
        console.error('[director] unparseable output, skip:', content.slice(0, 200));
        return;
      }
      await ctx.runMutation(internal.director.publishEvent, {
        worldId: context.worldId,
        title: sanitizeForPrompt(parsed.title, 30),
        description: sanitizeForPrompt(parsed.description, 300),
        highlights: parsed.highlights && sanitizeForPrompt(parsed.highlights, 120),
      });
      console.log(`[director] new event: ${parsed.title}`);
    } catch (e) {
      console.error('[director] failed, skip this round:', String(e));
    }
  },
});

// 事件"新鲜期"：距上一条事件不足这么久就不补产。取 2 小时 = cron 周期（30 分）的
// 4 倍，既保证访客进站时看到的是当天的新闻，又不会因为访客反复进出而连着催产。
export const EVENT_STALE_MS = 2 * 60 * 60 * 1000;

// 唤醒补产用：默认世界最新一条事件的 startTime（无世界或无事件则 null）。
// 不复用 directorContext——它在世界不 running 时返回 null，而补产恰恰跑在刚
// 唤醒的世界上；也不复用 latestActivity——它要 worldId，而 action 手里没有。
export const latestEventStartTime = internalQuery({
  args: {},
  handler: async (ctx) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .first();
    if (!worldStatus) return null;
    const latest = await ctx.db
      .query('jianghuEvents')
      .withIndex('worldTime', (q) => q.eq('worldId', worldStatus.worldId))
      .order('desc')
      .first();
    return latest ? latest.startTime : null;
  },
});

// 访客把休眠世界唤醒时的补产钩子（挂点见 world.ts 的 heartbeatWorld）。
// 没有访客时世界休眠，cron 编剧的"world not running"守卫就一路跳过，访客进站
// 只能看到几天前的旧闻——这个函数负责在唤醒后补上一条。
//
// 幂等性：与 30 分钟 cron 撞车时，最坏结果是两条事件间隔分钟级；publishEvent 会把
// 先前的 active 事件归档，不会出现双 active，没有一致性问题。而这里的 staleness
// 复查（跑的时候才读最新事件时间）已经把这个窗口压到可忽略：cron 刚产过事件的
// 世界会直接跳过补产。
export const generateEventIfStale = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const latestStartTime = await ctx.runQuery(internal.director.latestEventStartTime, {});
      if (latestStartTime !== null && Date.now() - latestStartTime < EVENT_STALE_MS) {
        console.log('[director] fresh enough, skip replenish');
        return;
      }
      await ctx.runAction(internal.director.generateEvent, {});
    } catch (e) {
      console.error('[director] replenish failed, skip:', String(e));
    }
  },
});

// 对话 prompt 注入用（Task 5 消费）
export const activeEventForPrompt = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    // 按索引字段过滤后，Convex 隐式按 _creationTime 排序，默认升序（最旧的在前）。
    // "至多一个 active" 是 publishEvent 维护的不变量，不是数据库约束——一旦哪天
    // 被 bug 打破，不加 order('desc') 这里会稳定拿到最旧的 active 事件，把过期
    // 设定注入对话。显式按新到旧排序，与 publishEvent 里对同一风险的防御强度一致。
    const event = await ctx.db
      .query('jianghuEvents')
      .withIndex('worldStatus', (q) => q.eq('worldId', args.worldId).eq('status', 'active'))
      .order('desc')
      .first();
    return event ? { title: event.title, description: event.description } : null;
  },
});

// 大事记 UI 用（Task 7 消费）
export const listEvents = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('jianghuEvents')
      .withIndex('worldTime', (q) => q.eq('worldId', args.worldId))
      .order('desc')
      .take(50);
  },
});

// 一次回顾最多取材多少条事件：低流量下断更几天再恢复时，别让积压的事件把 prompt 撑爆。
// 取 60 而不是 30：满负荷世界（全天有访客、cron 每 30 分产一条）一天最多 48 条，
// 30 会让健康世界天天触发截断、说书人只讲得到最近 15 小时；60 = 48 × 1.25 余量，
// 覆盖全天最大产量还留富余，截断只在"回顾连续多日失败、backlog 堆积"的病态场景才响。
const RECAP_MAX_EVENTS = 60;

// 剧集回顾上下文：默认世界 + 自上次回顾以来的事件（按 startTime 升序）。世界不存在则返回 null。
// 窗口从"过去 24h"改成"自上次回顾以来"：低流量下事件可能几天才产一条，固定 24h 窗口会
// 让回顾天天判定"无事件"而空转，新事件永远等不到被说书人讲。
export const recapContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .first();
    if (!worldStatus) return null;
    // 一次 collect 同时喂"最新一条回顾"和"回目序号"两个用途：这张表一天最多一条，
    // 全量扫描的量级无忧，比再发一次 order('desc').first() 更省一次读。
    // worldDay 索引是 [worldId, day]（_creationTime 自动附在索引尾部），day 写入时
    // 恒为当天日期，因此索引升序即时间序，末元素 === order('desc').first()，
    // 与 latestActivity 报给前端的 latestRecapTime 是同一条记录。
    const recaps = await ctx.db
      .query('episodeRecaps')
      .withIndex('worldDay', (q) => q.eq('worldId', worldStatus.worldId))
      .collect();
    const latestRecap = recaps[recaps.length - 1];
    const since = latestRecap ? latestRecap._creationTime : 0;
    // 这里必须**有界**读，不能 collect 后再截断：回顾若连续多日失败，since 就一直不
    // 前进、backlog 无限增长，无界 collect 迟早撞上 Convex 的单次查询扫描上限 → throw
    // → 被 generateRecap 外层 catch 吞掉 → 回顾又一次没生成 → since 还是不前进，
    // 从此永久自锁。take(N+1) 之后这个死锁在构造上不可能发生。
    // worldTime 索引是 [worldId, startTime]，order('desc') 取最近的 N+1 条（多取的那
    // 一条只用来探"是否还有更多"，不进 prompt），再 reverse 成升序——说书人按时间顺序讲。
    const recent = await ctx.db
      .query('jianghuEvents')
      .withIndex('worldTime', (q) => q.eq('worldId', worldStatus.worldId).gt('startTime', since))
      .order('desc')
      .take(RECAP_MAX_EVENTS + 1);
    const truncated = recent.length > RECAP_MAX_EVENTS;
    if (truncated) {
      // 丢掉的是最旧的那些：宁可漏讲上古旧闻，也要保证最近的戏被讲到。
      // 有界读换来的代价：只知道"多于 N 条"，给不出精确的 dropped 计数——这笔交易划算。
      console.log(
        `[recap] more than ${RECAP_MAX_EVENTS} events since last recap, keeping latest ${RECAP_MAX_EVENTS}`,
      );
    }
    const events = recent.slice(0, RECAP_MAX_EVENTS).reverse();
    return { worldId: worldStatus.worldId, events, episodeNumber: recaps.length + 1 };
  },
});

export const insertRecap = internalMutation({
  args: {
    worldId: v.id('worlds'),
    title: v.string(),
    body: v.string(),
    day: v.string(),
    eventIds: v.array(v.id('jianghuEvents')),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('episodeRecaps', args);
  },
});

// 回顾一天只有这一次 cron 机会：一次瞬时故障（限流、截断输出、模型抽风乱说话）就是
// 一整天的空白，所以「调用 + 解析」整体重试。下面的循环上界、"是否还有下一次"的判断
// 与两条日志的文案全部由这两个常量推导，改动上界不会静默丢掉等待或让日志说谎。
const RECAP_MAX_ATTEMPTS = 2;
const RECAP_RETRY_DELAY_MS = 10_000;

// 每日说书人总结。全程 fail-soft：任何失败只打日志，绝不抛错。
export const generateRecap = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const context = await ctx.runQuery(internal.director.recapContext, {});
      if (!context || context.events.length === 0) {
        console.log('[recap] no new events since last recap, skip');
        return;
      }
      const eventLines = context.events.map((e) => `- ${e.title}：${e.description}`);
      const prompt = buildRecapPrompt(eventLines, context.episodeNumber);
      // chatCompletion 内部已对 429/5xx 退避重试，这层多覆盖的是解析失败与不可重试的抛错。
      let parsed: { title: string; body: string } | null = null;
      let lastFailure = '';
      for (let attempt = 1; attempt <= RECAP_MAX_ATTEMPTS; attempt++) {
        try {
          const { content } = await chatCompletion({
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500,
          });
          parsed = parseRecapOutput(content);
          if (parsed) break;
          lastFailure = `unparseable output: ${content.slice(0, 200)}`;
        } catch (e) {
          lastFailure = String(e);
        }
        if (attempt < RECAP_MAX_ATTEMPTS) {
          console.error(
            `[recap] attempt ${attempt} failed, retrying in ${RECAP_RETRY_DELAY_MS / 1000}s:`,
            lastFailure,
          );
          await sleep(RECAP_RETRY_DELAY_MS);
        }
      }
      if (!parsed) {
        console.error(`[recap] all ${RECAP_MAX_ATTEMPTS} attempts failed, skip:`, lastFailure);
        return;
      }
      await ctx.runMutation(internal.director.insertRecap, {
        worldId: context.worldId,
        title: sanitizeForPrompt(parsed.title, 60),
        body: sanitizeForPrompt(parsed.body, 600),
        day: new Date().toISOString().slice(0, 10),
        eventIds: context.events.map((e) => e._id),
      });
      console.log(`[recap] ${parsed.title}`);
    } catch (e) {
      console.error('[recap] failed, skip:', String(e));
    }
  },
});

export const listRecaps = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('episodeRecaps')
      .withIndex('worldDay', (q) => q.eq('worldId', args.worldId))
      .order('desc')
      .take(30);
  },
});

// 事件横幅 + 「大事记」未读红点共用的轻量查询（Task 2 消费）。
// 刻意做成"一个查询喂两个消费者"：横幅只要最新一条事件的正文，红点只要
// 两张表各自最新一条的时间戳。若让它们各自去订阅 listEvents/listRecaps，
// 首页会白白常驻两份 50/30 条的全量列表订阅——而首页只需要 3 个标量。
export const latestActivity = query({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    // worldTime 索引是 [worldId, startTime]，order('desc') 即按 startTime 从新到旧，
    // 与 directorContext 里取近期事件的写法一致。
    const event = await ctx.db
      .query('jianghuEvents')
      .withIndex('worldTime', (q) => q.eq('worldId', args.worldId))
      .order('desc')
      .first();
    // worldDay 索引是 [worldId, day]，day 是 YYYY-MM-DD，字典序即时间序；
    // 同一天多条时由 _creationTime 兜底排序（与 listRecaps 的惯用法一致）。
    // 红点的时间戳用 _creationTime 而非 day：day 只有天粒度，无法和事件的
    // 毫秒级 startTime 比较。
    const recap = await ctx.db
      .query('episodeRecaps')
      .withIndex('worldDay', (q) => q.eq('worldId', args.worldId))
      .order('desc')
      .first();
    return {
      latestEventTime: event ? event.startTime : null,
      latestRecapTime: recap ? recap._creationTime : null,
      latestEvent: event ? { title: event.title, description: event.description } : null,
    };
  },
});
