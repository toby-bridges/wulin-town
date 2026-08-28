#!/usr/bin/env python3
"""碰撞图绘制工具（配合 data/collisionMap.txt 使用）。

collisionMap.txt：48 行 × 64 字符，行=y、列=x；'#'=挡路，'.'=可走。
地图格子与 public/assets/gentle-obj.png 的左上 2048×1536 区域按 32px/格 1:1 对齐
（图片按原始尺寸渲染、不缩放；右侧 480px、底部 160px 在格子外，角色不可达）。

子命令：
  grid    --x0 --y0 --w --h [--scale N] --out DIR   渲染带网格线+坐标标注的图块（供目视识别墙体）
  overlay [--x0 --y0 --w --h] [--scale N] --out DIR 把 collisionMap.txt 的 '#' 染红叠加在地图上（校验用）
  paint                                              从 stdin 逐行读命令改写 collisionMap.txt：
                                                       rect X0 Y0 X1 Y1 <#|.>   （含端点，自动裁剪到网格）
                                                       set X Y <#|.>
                                                       // 开头为注释行
  stats                                              统计挡路占比 + 可走区域连通分量（洪泛填充）
"""

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parent.parent
IMG_PATH = REPO / 'public/assets/gentle-obj.png'
TXT_PATH = REPO / 'data/collisionMap.txt'
GRID_W, GRID_H, TILE = 64, 48, 32


def load_grid() -> list[list[str]]:
    if not TXT_PATH.exists():
        return [['.'] * GRID_W for _ in range(GRID_H)]
    lines = TXT_PATH.read_text().splitlines()
    if len(lines) != GRID_H or any(len(l) != GRID_W for l in lines):
        sys.exit(f'collisionMap.txt 尺寸不对：需 {GRID_H} 行 × {GRID_W} 列，'
                 f'实际 {len(lines)} 行，行宽 {sorted({len(l) for l in lines})}')
    bad = {c for l in lines for c in l} - {'.', '#'}
    if bad:
        sys.exit(f'collisionMap.txt 含非法字符：{bad}')
    return [list(l) for l in lines]


def save_grid(grid: list[list[str]]) -> None:
    TXT_PATH.write_text('\n'.join(''.join(row) for row in grid) + '\n')


def font(size: int):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # 老版 Pillow
        return ImageFont.load_default()


def render(args, with_overlay: bool) -> None:
    x0, y0 = args.x0, args.y0
    w = min(args.w, GRID_W - x0)
    h = min(args.h, GRID_H - y0)
    s = args.scale
    img = Image.open(IMG_PATH).convert('RGBA')
    region = img.crop((x0 * TILE, y0 * TILE, (x0 + w) * TILE, (y0 + h) * TILE))
    region = region.resize((w * TILE * s, h * TILE * s), Image.NEAREST)

    layer = Image.new('RGBA', region.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if with_overlay:
        grid = load_grid()
        for ty in range(y0, y0 + h):
            for tx in range(x0, x0 + w):
                if grid[ty][tx] == '#':
                    px, py = (tx - x0) * TILE * s, (ty - y0) * TILE * s
                    d.rectangle([px, py, px + TILE * s - 1, py + TILE * s - 1],
                                fill=(255, 0, 0, 110))
    for i in range(w + 1):  # 竖线
        px = i * TILE * s
        major = (x0 + i) % 8 == 0
        d.line([(px, 0), (px, region.size[1])],
               fill=(255, 255, 255, 230) if major else (255, 255, 255, 90),
               width=2 if major else 1)
    for j in range(h + 1):  # 横线
        py = j * TILE * s
        major = (y0 + j) % 8 == 0
        d.line([(0, py), (region.size[0], py)],
               fill=(255, 255, 255, 230) if major else (255, 255, 255, 90),
               width=2 if major else 1)
    region = Image.alpha_composite(region, layer)

    # 四边加坐标标注边距
    m = max(22, 10 * s)
    canvas = Image.new('RGB', (region.size[0] + 2 * m, region.size[1] + 2 * m), (24, 24, 24))
    canvas.paste(region, (m, m))
    d = ImageDraw.Draw(canvas)
    f = font(max(10, 5 * s))
    for i in range(w):
        label, px = str(x0 + i), m + i * TILE * s + TILE * s // 2
        d.text((px, m // 2), label, fill=(255, 255, 0), font=f, anchor='mm')
        d.text((px, canvas.size[1] - m // 2), label, fill=(255, 255, 0), font=f, anchor='mm')
    for j in range(h):
        label, py = str(y0 + j), m + j * TILE * s + TILE * s // 2
        d.text((m // 2, py), label, fill=(255, 255, 0), font=f, anchor='mm')
        d.text((canvas.size[0] - m // 2, py), label, fill=(255, 255, 0), font=f, anchor='mm')

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    kind = 'overlay' if with_overlay else 'grid'
    path = out / f'{kind}_x{x0}y{y0}_w{w}h{h}_s{s}.png'
    canvas.save(path)
    print(path)


def paint() -> None:
    grid = load_grid()
    changed = 0
    for lineno, raw in enumerate(sys.stdin, 1):
        line = raw.strip()
        if not line or line.startswith('//'):
            continue
        parts = line.split()
        try:
            if parts[0] == 'rect' and len(parts) == 6:
                x0, y0, x1, y1, ch = *map(int, parts[1:5]), parts[5]
            elif parts[0] == 'set' and len(parts) == 4:
                x0, y0, ch = int(parts[1]), int(parts[2]), parts[3]
                x1, y1 = x0, y0
            else:
                raise ValueError
            if ch not in ('#', '.'):
                raise ValueError
        except ValueError:
            sys.exit(f'第 {lineno} 行命令不合法：{line!r}')
        for ty in range(max(0, min(y0, y1)), min(GRID_H - 1, max(y0, y1)) + 1):
            for tx in range(max(0, min(x0, x1)), min(GRID_W - 1, max(x0, x1)) + 1):
                if grid[ty][tx] != ch:
                    grid[ty][tx] = ch
                    changed += 1
    save_grid(grid)
    blocked = sum(row.count('#') for row in grid)
    print(f'改动 {changed} 格；当前挡路 {blocked}/{GRID_W * GRID_H}'
          f'（{blocked / GRID_W / GRID_H:.1%}）')


def stats() -> None:
    grid = load_grid()
    blocked = sum(row.count('#') for row in grid)
    print(f'挡路 {blocked}/{GRID_W * GRID_H}（{blocked / GRID_W / GRID_H:.1%}）')
    seen = [[False] * GRID_W for _ in range(GRID_H)]
    comps = []
    for sy in range(GRID_H):
        for sx in range(GRID_W):
            if grid[sy][sx] != '.' or seen[sy][sx]:
                continue
            stack, size = [(sx, sy)], 0
            seen[sy][sx] = True
            minx = maxx = sx
            miny = maxy = sy
            while stack:
                x, y = stack.pop()
                size += 1
                minx, maxx = min(minx, x), max(maxx, x)
                miny, maxy = min(miny, y), max(maxy, y)
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < GRID_W and 0 <= ny < GRID_H \
                            and grid[ny][nx] == '.' and not seen[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            comps.append((size, (minx, miny, maxx, maxy)))
    comps.sort(reverse=True)
    print(f'可走连通分量 {len(comps)} 个：')
    for size, bbox in comps[:12]:
        print(f'  {size} 格，范围 x{bbox[0]}-{bbox[2]} y{bbox[1]}-{bbox[3]}')
    if len(comps) > 12:
        print(f'  …另有 {len(comps) - 12} 个')


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest='cmd', required=True)
    for name in ('grid', 'overlay'):
        sp = sub.add_parser(name)
        sp.add_argument('--x0', type=int, default=0)
        sp.add_argument('--y0', type=int, default=0)
        sp.add_argument('--w', type=int, default=GRID_W)
        sp.add_argument('--h', type=int, default=GRID_H)
        sp.add_argument('--scale', type=int, default=1)
        sp.add_argument('--out', required=True)
    sub.add_parser('paint')
    sub.add_parser('stats')
    args = p.parse_args()
    if args.cmd == 'grid':
        render(args, with_overlay=False)
    elif args.cmd == 'overlay':
        render(args, with_overlay=True)
    elif args.cmd == 'paint':
        paint()
    else:
        stats()


if __name__ == '__main__':
    main()
