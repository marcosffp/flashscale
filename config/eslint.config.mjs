// negocio.md §7.2 — lint roda nos 3 serviços NestJS (gateway, api, orchestrator)
// mais os testes centralizados em tests/. dashboard/ tem seu próprio config
// porque é um projeto npm independente (React, não NestJS).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    // tests/load roda em runtime k6 (globals __ENV/__VU/__ITER), não Node —
    // fora do escopo do lint dos 3 serviços NestJS.
    ignores: ['dist', 'node_modules', 'dashboard', 'coverage', 'tests/load'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      // Casts `as any` são usados deliberadamente nos testes pra montar
      // requests/responses fake sem replicar os tipos inteiros do Express/Axios.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
