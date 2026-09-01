module.exports = {
  parser: '@typescript-eslint/parser', // Specifies the ESLint parser
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: [
    'plugin:@typescript-eslint/recommended', // Uses the recommended rules from the @typescript-eslint/eslint-plugin
    'plugin:@typescript-eslint/recommended-type-checked',
  ],
  parserOptions: {
    project: './tsconfig.json',
    ecmaVersion: 2018, // Allows for the parsing of modern ECMAScript features
    sourceType: 'module', // Allows for the use of imports
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-non-null-assertion': 'off',

    // React hooks 护栏。此前整个项目的 hooks 规则全靠人工自查，条件调用、
    // 早退 return 上面漏掉的 hook 这类错误只能靠 review 发现。
    //
    // 两条规则的严重级刻意不同：
    // - rules-of-hooks 是 error。它抓的是「hook 顺序在两次渲染间会变」，
    //   这类写法没有正当用法，一律是 bug，必须挡住。
    // - exhaustive-deps 只是 warn。依赖数组里少写一项常常是有意的
    //   （比如 App.tsx 的水位线 effect、EventTitleCard 的基线 effect，都
    //   刻意只让部分依赖触发重跑），这条规则无法区分「有意省略」和「真漏」，
    //   设成 error 会立刻把一堆正确代码判成不合格。先把提示打开，逐条人工
    //   分诊，不要用它打断构建。
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
};
