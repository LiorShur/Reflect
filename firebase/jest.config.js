/** @type {import('jest').Config} */
module.exports = {
  displayName: 'rules',
  testEnvironment: 'node',
  rootDir: '..',
  testMatch: ['<rootDir>/firebase/tests/**/*.test.ts'],
  preset: 'ts-jest',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/firebase/tsconfig.json' }],
  },
  testTimeout: 20000,
};
