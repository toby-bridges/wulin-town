import type { JestConfigWithTsJest } from 'ts-jest';

// 让 ts-jest 也处理 .js：convex/_generated/*.js 是 ESM，默认被 jest 当 CJS 读，
// 于是任何 import 链碰到 _generated 的模块（game.ts / world.ts / agent.ts ...）
// 都以 "Cannot use import statement outside a module" 失败——这是本仓测试长期
// 只能覆盖纯数据模块的原因。tsconfig 两处都已 allowJs，这里补上 transform 即可。
const jestConfig: JestConfigWithTsJest = {
  preset: 'ts-jest/presets/default-esm',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { useESM: true }],
  },
};
export default jestConfig;
