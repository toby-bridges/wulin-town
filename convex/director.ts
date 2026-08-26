import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery, query } from './_generated/server';
import { chatCompletion } from './util/llm';
import { sanitizeForPrompt } from './util/sanitize';
import { buildDirectorPrompt, parseDirectorOutput } from './util/directorPrompt';
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
        console.log('[director] unparseable output, skip:', content.slice(0, 200));
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
      console.log('[director] failed, skip this round:', String(e));
    }
  },
});

// 对话 prompt 注入用（Task 5 消费）
export const activeEventForPrompt = internalQuery({
  args: { worldId: v.id('worlds') },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query('jianghuEvents')
      .withIndex('worldStatus', (q) => q.eq('worldId', args.worldId).eq('status', 'active'))
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
