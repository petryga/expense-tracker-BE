module.exports = {
  root: true,
  env: { node: true, es2021: true },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'node_modules'],
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module' },
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    // `declare global { namespace Express { ... } }` is the standard way to
    // augment Express's Request type and is exempt via allowDeclarations.
    '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
  },
  overrides: [
    {
      // Mocking Sequelize models/spies often needs loose typing that isn't
      // worth fighting; keep the rule off here instead of littering casts.
      files: ['*.test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
