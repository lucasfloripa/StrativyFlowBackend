// @ts-check

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierRecommended from 'eslint-plugin-prettier/recommended'
import importPlugin from 'eslint-plugin-import'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'package.json'],
  },

  // Base JS recommended
  eslint.configs.recommended,

  // Typescript (type-check enabled)
  ...tseslint.configs.recommendedTypeChecked,

  // Prettier
  prettierRecommended,

  {
    plugins: {
      import: importPlugin,
    },

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module', // equivalente ao seu eslintrc original
      globals: {
        ...globals.node,
        ...globals.es2021,
        ...globals.jest,
      },
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig-test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },

    settings: {
      'import/resolver': {
        typescript: {
          project: ['./tsconfig.json', './tsconfig-test.json'],
        },
      },
    },

    rules: {
      /**
       * =========================
       *  TYPESCRIPT RULES
       * =========================
       */

      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-invalid-void-type': 'off',

      /**
       * =========================
       *  PRETTIER
       * =========================
       */

      'prettier/prettier': ['error', { endOfLine: 'auto' }],

      /**
       * =========================
       *  IMPORT RULES
       * =========================
       */

      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],

      'import/newline-after-import': 'error',
      'import/no-duplicates': 'error',
    },
  },
)