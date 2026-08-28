// 碰撞图数据不变量测试：collisionMap.txt 是唯一事实来源，
// gentle.js 的 objmap 由 data/convertCollision.mjs 生成，两者必须一致。
import { readFileSync } from 'node:fs';
import * as gentle from '../../data/gentle';

const W = 64;
const H = 48;
const objmap = (gentle as any).objmap as number[][][];
const lines = readFileSync('data/collisionMap.txt', 'utf8')
  .split('\n')
  .filter((l) => l.length > 0);

describe('collisionMap.txt', () => {
  test('尺寸为 48 行 × 64 列，只含 . 和 #', () => {
    expect(lines.length).toBe(H);
    for (const l of lines) {
      expect(l.length).toBe(W);
      expect(/^[.#]+$/.test(l)).toBe(true);
    }
  });

  test('可走区域恰好构成一个连通分量（门洞连通、无孤岛）', () => {
    const seen = new Set<string>();
    let components = 0;
    for (let sy = 0; sy < H; sy++) {
      for (let sx = 0; sx < W; sx++) {
        if (lines[sy][sx] !== '.' || seen.has(`${sx},${sy}`)) continue;
        components++;
        const stack: Array<[number, number]> = [[sx, sy]];
        seen.add(`${sx},${sy}`);
        while (stack.length) {
          const [x, y] = stack.pop()!;
          for (const [nx, ny] of [
            [x + 1, y],
            [x - 1, y],
            [x, y + 1],
            [x, y - 1],
          ] as Array<[number, number]>) {
            if (
              nx >= 0 &&
              nx < W &&
              ny >= 0 &&
              ny < H &&
              lines[ny][nx] === '.' &&
              !seen.has(`${nx},${ny}`)
            ) {
              seen.add(`${nx},${ny}`);
              stack.push([nx, ny]);
            }
          }
        }
      }
    }
    expect(components).toBe(1);
  });

  test('挡路占比在合理区间（防呆）', () => {
    const blocked = lines.join('').split('').filter((c) => c === '#').length;
    expect(blocked).toBeGreaterThan(0);
    expect(blocked / (W * H)).toBeLessThan(0.8);
    expect(blocked / (W * H)).toBeGreaterThan(0.3);
  });
});

describe('gentle.js objmap（生成物）', () => {
  test('单层、[x][y] 索引、64×48、取值仅 1/-1', () => {
    expect(objmap.length).toBe(1);
    expect(objmap[0].length).toBe(W);
    for (const col of objmap[0]) {
      expect(col.length).toBe(H);
      for (const v of col) expect(v === 1 || v === -1).toBe(true);
    }
  });

  test('与 collisionMap.txt 逐格一致（含转置方向）', () => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const want = lines[y][x] === '#' ? 1 : -1;
        if (objmap[0][x][y] !== want) {
          throw new Error(`(${x},${y}) 不一致：txt=${lines[y][x]} objmap=${objmap[0][x][y]}`);
        }
      }
    }
  });

  test('地图尺寸配置与数组一致（PIT-0005 防回归）', () => {
    expect((gentle as any).mapwidth).toBe(W);
    expect((gentle as any).mapheight).toBe(H);
    expect((gentle as any).screenxtiles).toBe(W);
    expect((gentle as any).screenytiles).toBe(H);
  });

  test('关键位置抽查：墙挡路、地面与门洞可走', () => {
    const blockedAt = (x: number, y: number) => objmap[0][x][y] === 1;
    // 墙与家具
    expect(blockedAt(2, 2)).toBe(true); // 西外墙
    expect(blockedAt(26, 17)).toBe(true); // 后院水井
    expect(blockedAt(37, 7)).toBe(true); // 客房一床铺
    expect(blockedAt(40, 29)).toBe(true); // 大堂桌凳
    // 地面
    expect(blockedAt(12, 12)).toBe(false); // 厨房地面
    expect(blockedAt(23, 17)).toBe(false); // 后院空地
    expect(blockedAt(45, 28)).toBe(false); // 大堂地板
    expect(blockedAt(0, 0)).toBe(false); // 外圈草地
    // 门洞与通道
    expect(blockedAt(18, 13)).toBe(false); // 厨房东门
    expect(blockedAt(25, 22)).toBe(false); // 后院垂花门
    expect(blockedAt(52, 17)).toBe(false); // 大堂北门洞
    expect(blockedAt(51, 44)).toBe(false); // 同福客栈大门
    expect(blockedAt(59, 20)).toBe(false); // 楼梯踏步
    expect(blockedAt(35, 34)).toBe(false); // 大堂西门
  });
});
