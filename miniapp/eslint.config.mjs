import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

/**
 * 小程序端 lint 配置（ESLint 9 flat config）
 * 和桌面端保持同一套规则，额外放开微信小程序 / Taro 的运行环境全局。
 */
export default tseslint.config(
  // ec-canvas 是 echarts-for-weixin 的第三方组件（老式 JS，连分号风格都不同），不参与 lint
  { ignores: ['dist/**', 'node_modules/**', '.sync-verify/**', 'config/**', '_preview/**', 'src/components/ec-canvas/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        wx: 'readonly',
        getCurrentPages: 'readonly',
        getApp: 'readonly',
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'prefer-const': 'warn',
    },
  }
)
