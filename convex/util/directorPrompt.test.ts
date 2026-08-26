import { buildDirectorPrompt, parseDirectorOutput } from './directorPrompt';

describe('buildDirectorPrompt', () => {
  test('包含世界观、人设、近期事件与 JSON 输出要求', () => {
    const p = buildDirectorPrompt({
      characterLines: ['佟湘玉：同福客栈掌柜，精明抠门刀子嘴豆腐心'],
      recentTitles: ['六扇门年检'],
    });
    expect(p).toContain('武林外传');
    expect(p).toContain('佟湘玉');
    expect(p).toContain('六扇门年检');
    expect(p).toContain('JSON');
  });
});

describe('parseDirectorOutput', () => {
  test('解析裸 JSON', () => {
    expect(
      parseDirectorOutput('{"title":"钱夫人催租","description":"d","highlights":"h"}'),
    ).toEqual({ title: '钱夫人催租', description: 'd', highlights: 'h' });
  });
  test('解析 markdown 代码块包裹的 JSON', () => {
    expect(
      parseDirectorOutput('```json\n{"title":"t","description":"d"}\n```'),
    ).toEqual({ title: 't', description: 'd', highlights: undefined });
  });
  test('解析失败返回 null 而不是抛错', () => {
    expect(parseDirectorOutput('今天风和日丽')).toBeNull();
  });
  test('缺 title 或 description 返回 null', () => {
    expect(parseDirectorOutput('{"title":"只有标题"}')).toBeNull();
  });
});
