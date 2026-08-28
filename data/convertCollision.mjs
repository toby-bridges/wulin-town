#!/usr/bin/env node
// 把 data/collisionMap.txt（48 行 × 64 列，'#'=挡路 '.'=可走，行=y 列=x）
// 转成引擎需要的单层 objmap（[layer][x][y]，1=挡路，-1=可走），
// 并原地替换 data/gentle.js 中的 objmap 区块，其余内容一字节不动。
// 用法：node data/convertCollision.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const TXT = join(DIR, 'collisionMap.txt');
const GENTLE = join(DIR, 'gentle.js');
const W = 64;
const H = 48;

const lines = readFileSync(TXT, 'utf8').split('\n').filter((l) => l.length > 0);
if (lines.length !== H) throw new Error(`collisionMap.txt 应有 ${H} 行，实际 ${lines.length}`);
for (const [i, l] of lines.entries()) {
  if (l.length !== W) throw new Error(`第 ${i} 行应有 ${W} 列，实际 ${l.length}`);
  if (/[^.#]/.test(l)) throw new Error(`第 ${i} 行含非法字符`);
}

// 转置：objmap[0][x][y]
const cols = [];
for (let x = 0; x < W; x++) {
  const col = [];
  for (let y = 0; y < H; y++) col.push(lines[y][x] === '#' ? 1 : -1);
  cols.push(col);
}
const blocked = cols.flat().filter((v) => v === 1).length;

const body = cols.map((col) => `[ ${col.join(' , ')} , ],`).join('\n');
const block = [
  'export const objmap = [',
  '// 由 data/convertCollision.mjs 从 data/collisionMap.txt 生成：单层碰撞层，1=挡路，-1=可走。',
  '// 改碰撞请编辑 collisionMap.txt 后重跑转换器，不要手改本区块。索引为 [x][y]。',
  '[',
  body,
  '],];',
].join('\n');

const src = readFileSync(GENTLE, 'utf8');
const start = src.indexOf('export const objmap = [');
if (start < 0) throw new Error('gentle.js 中找不到 objmap 区块起点');
const endMarker = '],];';
const end = src.indexOf(endMarker, start);
if (end < 0) throw new Error('gentle.js 中找不到 objmap 区块终点');
const out = src.slice(0, start) + block + src.slice(end + endMarker.length);
writeFileSync(GENTLE, out);
console.log(`objmap 已重写：1 层 ${W}×${H}，挡路 ${blocked}/${W * H}（${((blocked / W / H) * 100).toFixed(1)}%）`);
