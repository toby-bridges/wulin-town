// 编剧 prompt 组装与输出解析。纯函数，无 IO，便于单测。

export function buildDirectorPrompt(input: {
  characterLines: string[];
  recentTitles: string[];
}): string {
  const lines = [
    '你是情景喜剧《武林外传》的编剧。舞台是七侠镇同福客栈，时间在电视剧大结局之后。',
    '你要为客栈编排"今日事件"：一件闯入日常的小事，让角色们围绕它自然碰撞出笑料。',
    '事件必须：符合武侠市井背景；贴合角色既有性格与关系（不得改变人设与感情线）；',
    '有戏剧张力但格局小（客栈内外的日常危机、误会、来客，不要打打杀杀的大事）。',
    '',
    '客栈角色（人设描述里的"你"是对角色本人的称呼，不代表编剧或读者）：',
    ...input.characterLines,
    '',
    '最近已演过的事件（避免重复题材）：',
    ...(input.recentTitles.length ? input.recentTitles.map((t) => `- ${t}`) : ['- （暂无）']),
    '',
    '参考事件范例（只学格式与味道；这几个设定当成已经演过，不要照抄标题，也不要换个说法',
    '重讲同一个核心设定——尤其"六扇门/官差查文书、账目、身份"这类，最容易被换皮重复，除非',
    '近期事件里完全没出现过这条线，否则优先换成别的麻烦来源：天气/意外、来客投宿、镇上活动、',
    '失物/误会、债务人情等）：',
    '- 六扇门年检：六扇门派员来查客栈经营文书，白展堂如坐针毡',
    '- 钱夫人催租：钱掌柜遗孀上门催三个月房租，佟湘玉肉疼',
    '- 厨艺比试：镇上办厨艺大赛，李大嘴摩拳擦掌要夺魁',
    '- 圣贤书失踪：吕秀才珍藏的书不见了，怀疑莫小贝拿去垫桌脚',
    '',
    '只输出一个 JSON 对象，不要输出任何其他文字，格式：',
    '{"title": "六字以内的事件名", "description": "两三句话说清事件本身，不写角色反应", "highlights": "一句话点出最可能出戏的角色与冲突"}',
  ];
  return lines.join('\n');
}

// 回顾（recap）输出的字段是 title/body，与编剧输出的 title/description/highlights
// 形状不同，因此单独解析而不是复用 parseDirectorOutput；容错策略保持一致。
export function parseRecapOutput(content: string): { title: string; body: string } | null {
  const stripped = content.replace(/```(?:json)?/gi, '').trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as unknown;
    if (typeof obj !== 'object' || obj === null) return null;
    const record = obj as Record<string, unknown>;
    if (typeof record.title !== 'string' || typeof record.body !== 'string') return null;
    return { title: record.title, body: record.body };
  } catch {
    return null;
  }
}

export function parseDirectorOutput(
  raw: string,
): { title: string; description: string; highlights?: string } | null {
  const stripped = raw.replace(/```(?:json)?/gi, '').trim();
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as unknown;
    if (typeof obj !== 'object' || obj === null) return null;
    const record = obj as Record<string, unknown>;
    if (typeof record.title !== 'string' || typeof record.description !== 'string') return null;
    return {
      title: record.title,
      description: record.description,
      highlights: typeof record.highlights === 'string' ? record.highlights : undefined,
    };
  } catch {
    return null;
  }
}
