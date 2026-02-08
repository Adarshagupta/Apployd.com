module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parserOptions: {
    project: false,
  },
  extends: ['eslint:recommended', 'plugin:import/recommended', 'prettier'],
  rules: {
    'import/order': [
      'error',
      {
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true },
      },
    ],
    'no-console': 'off',
  },
  ignorePatterns: ['dist', '.next', 'coverage', 'node_modules'],
};
