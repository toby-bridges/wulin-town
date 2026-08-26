import { Container, Graphics, Text } from '@pixi/react';
import * as PIXI from 'pixi.js';
import { useCallback, useMemo } from 'react';

const MAX_CHARS = 40;
const WRAP_WIDTH = 150;

export function SpeechBubble({ x, y, text }: { x: number; y: number; text: string }) {
  const shown = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + '…' : text;
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
