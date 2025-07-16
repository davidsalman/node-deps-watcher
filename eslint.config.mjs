import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import { FlatCompat } from '@eslint/eslintrc'
import { fixupPluginRules } from '@eslint/compat'

import globals from 'globals'
import _import from 'eslint-plugin-import'
import prettier from 'eslint-plugin-prettier'
import typescriptEslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...compat.extends('plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended', 'prettier'),
  {
    files: ['**/*.{js,mjs,cjs,ts}'],
    ignores: ['node_modules', 'dist'],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parser: tsParser,
      ecmaVersion: 2018,
    },
    plugins: {
      import: fixupPluginRules(_import),
      '@typescript-eslint': typescriptEslint,
      prettier: prettier,
    },
    settings: {
      'import/resolver': {
        typescript: {},
      },
    },
    rules: {
      'callback-return': 'error',
      'class-methods-use-this': 'off',
      'constructor-super': 'error',
      'dot-location': ['error', 'property'],
      eqeqeq: 'error',
      'generator-star-spacing': ['error', 'after'],
      'linebreak-style': ['error', 'unix'],
      'no-catch-shadow': 'error',
      'no-console': 'off',
      'no-duplicate-imports': 'error',
      'no-else-return': 'off',
      'no-implicit-globals': 'error',
      'no-invalid-this': 'error',
      'no-label-var': 'error',
      'no-nested-ternary': 'error',
      'no-param-reassign': [
        'error',
        {
          props: false,
        },
      ],
      'no-path-concat': 'error',
      'no-plusplus': 'off',
      'no-shadow': 'off',
      'no-this-before-super': 'error',
      'no-unexpected-multiline': 'warn',
      'no-unmodified-loop-condition': 'error',
      'no-useless-call': 'error',
      'no-void': 'error',
      'prefer-arrow-callback': [
        'error',
        {
          allowNamedFunctions: true,
        },
      ],
      'prefer-const': [
        'error',
        {
          destructuring: 'all',
        },
      ],
      'prefer-spread': 'error',
      'prefer-template': 'off',

      '@typescript-eslint/array-type': ['off'],
      '@typescript-eslint/ban-ts-comment': ['off'],
      '@typescript-eslint/ban-ts-ignore': ['off'],
      '@typescript-eslint/ban-types': ['off'],
      '@typescript-eslint/camelcase': ['off'],
      '@typescript-eslint/explicit-function-return-type': ['off'],
      '@typescript-eslint/explicit-member-accessibility': ['off'],
      '@typescript-eslint/explicit-module-boundary-types': ['off'],
      '@typescript-eslint/indent': ['off'],
      '@typescript-eslint/member-delimiter-style': ['off'],
      '@typescript-eslint/no-duplicate-enum-values': ['off'],
      '@typescript-eslint/no-empty-function': ['off'],
      '@typescript-eslint/no-empty-object-type': ['off'],
      '@typescript-eslint/no-explicit-any': ['off'],
      '@typescript-eslint/no-extra-semi': ['off'],
      '@typescript-eslint/no-non-null-assertion': ['error'],
      '@typescript-eslint/no-object-literal': ['off'],
      '@typescript-eslint/no-object-literal-type-assertion': ['off'],
      '@typescript-eslint/no-require-imports': ['off'],
      '@typescript-eslint/no-shadow': [
        'error',
        {
          allow: ['cb', 'next', 'req', 'res', 'err', 'error'],
        },
      ],
      '@typescript-eslint/no-unsafe-function-type': ['off'],
      '@typescript-eslint/no-unused-expressions': ['off'],
      '@typescript-eslint/no-unused-vars': ['off'],
      '@typescript-eslint/no-use-before-define': ['off'],
      '@typescript-eslint/no-var-requires': ['off'],
      '@typescript-eslint/prefer-interface': ['off'],
      '@typescript-eslint/prefer-literal-enum-member': 'error',
    },
  },
]
