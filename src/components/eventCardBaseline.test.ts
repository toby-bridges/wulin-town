import { nextBaseline } from './eventCardBaseline';

// 这组用例就是「初始加载不弹题卡、只有事件更新才弹」这句话的可执行版本。
describe('nextBaseline', () => {
  test('查询未就绪（undefined）时不动基线、不弹卡', () => {
    expect(nextBaseline(null, undefined)).toEqual({ show: false, seen: null });
    expect(nextBaseline(1000, undefined)).toEqual({ show: false, seen: 1000 });
  });

  test('首次拿到数据只记基线，不弹卡', () => {
    expect(nextBaseline(null, 1000)).toEqual({ show: false, seen: 1000 });
  });

  test('世界还没有任何事件时，基线记 0 且不弹卡', () => {
    expect(nextBaseline(null, null)).toEqual({ show: false, seen: 0 });
  });

  test('同一时间戳重复推送只弹一次（第二次不弹）', () => {
    const first = nextBaseline(null, 1000);
    expect(nextBaseline(first.seen, 1000)).toEqual({ show: false, seen: 1000 });
  });

  test('时间戳变大 → 弹卡并推进基线', () => {
    expect(nextBaseline(1000, 2000)).toEqual({ show: true, seen: 2000 });
  });

  test('弹过之后同一条事件不再弹', () => {
    const fired = nextBaseline(1000, 2000);
    expect(fired.show).toBe(true);
    expect(nextBaseline(fired.seen, 2000)).toEqual({ show: false, seen: 2000 });
  });

  test('时间戳变小（异常倒流）保持高水位且不弹卡', () => {
    expect(nextBaseline(2000, 1000)).toEqual({ show: false, seen: 2000 });
  });

  test('从空世界（基线 0）拿到第一条事件会弹卡', () => {
    expect(nextBaseline(0, 1700000000000)).toEqual({ show: true, seen: 1700000000000 });
  });

  test('完整时序：加载 → 静默 → 新事件 → 再静默', () => {
    let seen: number | null = null;
    const fired: number[] = [];
    for (const incoming of [undefined, 1000, 1000, 1000, 2000, 2000] as const) {
      const d = nextBaseline(seen, incoming);
      seen = d.seen;
      if (d.show) fired.push(seen!);
    }
    // 初载的 1000 一次都没弹，只有升到 2000 的那一步弹了一张。
    expect(fired).toEqual([2000]);
  });
});
