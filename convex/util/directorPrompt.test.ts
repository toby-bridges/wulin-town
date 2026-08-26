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
  test('截断的 JSON（没有闭合花括号）返回 null 而不是抛错', () => {
    expect(parseDirectorOutput('{"title":"钱夫人催租","description":"她来了')).toBeNull();
  });
  test('多个 JSON 对象拼接时返回 null（贪婪匹配会把整段当一个非法 JSON 解析）', () => {
    expect(
      parseDirectorOutput(
        '{"title":"a","description":"b"}{"title":"c","description":"d"}',
      ),
    ).toBeNull();
  });
  test('整段输出不含花括号（数组/null 等非对象形状）时返回 null', () => {
    // 注意：这两个输入在到达 typeof/null 防御之前就已经被 "没有 { } 可匹配" 短路掉了
    // （regex 要求匹配到 { 才会进入 JSON.parse），这里验证的是那条更早的路径，
    // 不是 obj 类型检查那一行。
    expect(parseDirectorOutput('[1,2,3]')).toBeNull();
    expect(parseDirectorOutput('null')).toBeNull();
  });
  test('JSON 对象前后夹杂寒暄文字时仍能提取', () => {
    expect(
      parseDirectorOutput('好的，这是您要的事件：{"title":"a","description":"b"} 满意吗？'),
    ).toEqual({ title: 'a', description: 'b', highlights: undefined });
  });
});
