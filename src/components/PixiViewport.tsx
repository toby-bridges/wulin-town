// Based on https://codepen.io/inlet/pen/yLVmPWv.
// Copyright (c) 2018 Patrick Brouwer, distributed under the MIT license.

import { PixiComponent, useApp } from '@pixi/react';
import { Viewport } from 'pixi-viewport';
import { Application } from 'pixi.js';
import { MutableRefObject, ReactNode } from 'react';

export type ViewportProps = {
  app: Application;
  viewportRef?: MutableRefObject<Viewport | undefined>;

  screenWidth: number;
  screenHeight: number;
  worldWidth: number;
  worldHeight: number;
  children?: ReactNode;
};

// https://davidfig.github.io/pixi-viewport/jsdoc/Viewport.html
export default PixiComponent('Viewport', {
  create(props: ViewportProps) {
    const { app, children, viewportRef, ...viewportProps } = props;
    const viewport = new Viewport({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      events: app.renderer.events,
      passiveWheel: false,
      ...viewportProps,
    } as any);
    if (viewportRef) {
      viewportRef.current = viewport;
    }
    // Activate plugins
    const minScale = Math.max(
      0.3,
      Math.min(props.screenWidth / props.worldWidth, props.screenHeight / props.worldHeight)
    );
    viewport
      .drag()
      .pinch({})
      .wheel({ smooth: 3 })
      .decelerate()
      .clamp({ direction: 'all', underflow: 'center' })
      .clampZoom({
        minScale: minScale,
        maxScale: 4.0,
      });
    // 设置初始缩放
    viewport.setZoom(minScale * 1.5);

    // 挂载 update 到 ticker，让动画和平滑缩放生效
    const updateFn = () => viewport.update(app.ticker.deltaMS);
    app.ticker.add(updateFn);

    // 监听销毁事件来清理 ticker
    viewport.on('destroyed', () => {
      app.ticker.remove(updateFn);
    });

    return viewport;
  },
  applyProps(viewport, oldProps: any, newProps: any) {
    Object.keys(newProps).forEach((p) => {
      if (p !== 'app' && p !== 'viewportRef' && p !== 'children' && oldProps[p] !== newProps[p]) {
        // @ts-expect-error Ignoring TypeScript here
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        viewport[p] = newProps[p];
      }
    });
  },
});
