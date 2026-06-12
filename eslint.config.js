import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import { defineConfig, globalIgnores } from 'eslint/config'

// jsx-a11y recommended ruleset, but every rule downgraded to "warn" so the
// existing a11y backlog (partial radiogroups, role-on-non-semantic, …) does
// not fail `npm run lint` (must stay exit 0). Ratchet to "error" as the
// backlog is cleared. (§7c.6)
const jsxA11yWarnRules = Object.fromEntries(
  Object.keys(jsxA11y.flatConfigs.recommended.rules).map((rule) => [rule, 'warn'])
)

export default defineConfig([
  globalIgnores(['dist', 'dist-server', 'coverage', '.claude/worktrees/**', 'playwright-report/**', 'test-results/**']),
  // jsx-a11y baseline — scoped to React source only, as warnings (§7c.6).
  {
    files: ['src/**/*.jsx'],
    plugins: { 'jsx-a11y': jsxA11y },
    rules: jsxA11yWarnRules,
  },
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
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]|^motion$', destructuredArrayIgnorePattern: '^_' }],
      'react-refresh/only-export-components': ['warn', {
        allowConstantExport: true,
        allowExportNames: [
          'useAdminPanel',
          'useAgentScope',
          'useAuth',
          'useBranchScope',
          'useDashboard',
          'useDashboardNav',
          'useDashboardPanel',
          'useDataScope',
          'useEmployerScope',
          'useEmployerPanel',
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
