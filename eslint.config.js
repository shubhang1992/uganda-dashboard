import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dist-server', 'coverage', '.claude/worktrees/**', 'playwright-report/**', 'test-results/**']),
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
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]|^motion$', destructuredArrayIgnorePattern: '^_' }],
      'react-refresh/only-export-components': ['warn', {
        allowConstantExport: true,
        allowExportNames: [
          'useAgentScope',
          'useAuth',
          'useBranchScope',
          'useDashboard',
          'useDashboardNav',
          'useDashboardPanel',
          'useSignIn',
          'useSignup',
          'useSubscriberPanel',
          'useToast',
          'useApp',
          'useWarmup',
          'STEPS',
          'AGENT_STEP',
          'PENDING_REVIEW_STEP',
          'getStepIndex',
        ],
      }],
    },
  },
])
