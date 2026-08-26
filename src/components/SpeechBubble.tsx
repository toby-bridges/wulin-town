import { Container, Graphics, Text } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { useCallback, useMemo } from 'react';

const MAX_CHARS = 40;
const WRAP_WIDTH = 150;

export function SpeechBubble({ x, y, text }: { x: number; y: number; text: string }) {
  // 按 Unicode code point 截断（而非 UTF-16 code unit），避免在代理对（如 emoji）中间切开导致
  // 出现孤立高位代理、渲染出缺字形/替换符。LLM 生成的文本不受控，可能在第 40 个字符处恰好
  // 压中代理对边界。
  const chars = [...text];
  const shown = chars.length > MAX_CHARS ? chars.slice(0, MAX_CHARS).join('') + '…' : text;
  const style = useMemo(
    () =>
      new PIXI.TextStyle({
        fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif', // 系统字体栈，不引入字体资产
        fontSize: 12,
        fill: 0x2b2116,
        wordWrap: true,
        wordWrapWidth: WRAP_WIDTH,
        breakWords: true, // 中文换行必需
        lineHeight: 16,
      }),
    [],
  );
  const metrics = useMemo(() => PIXI.TextMetrics.measureText(shown, style), [shown, style]);
  const w = metrics.width + 16;
  const h = metrics.height + 12;
  const draw = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      g.beginFill(0xfff8e7, 0.95);
      g.lineStyle(1, 0x8a6d3b, 1);
      g.drawRoundedRect(-w / 2, -h, w, h, 6);
      // 小尾巴指向角色
      g.moveTo(-4, 0);
      g.lineTo(0, 6);
      g.lineTo(4, 0);
      g.endFill();
    },
    [w, h],
  );
  return (
    <Container x={x} y={y} zIndex={10}>
      <Graphics draw={draw} />
      <Text text={shown} style={style} anchor={{ x: 0.5, y: 1 }} y={-6} />
    </Container>
  );
}
