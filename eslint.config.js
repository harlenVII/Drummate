import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // The react-hooks v7 plugin flags two patterns this codebase uses
      // deliberately and correctly, so they are disabled rather than papered
      // over with per-line eslint-disable comments:
      //   - set-state-in-effect: derive/reset local state when a prop changes
      //     (modal-open form resets, DOM-measure layout positioning, liveQuery
      //     subscription resets, the AuthProvider bootstrap). All reviewed.
      //   - only-export-components: context files intentionally export their
      //     useAuth/useLanguage hook next to the provider; this is a dev-only
      //     Fast Refresh hint, not a correctness rule.
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
])
