/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '..',
  testMatch: ['<rootDir>/tests/unit/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
};
