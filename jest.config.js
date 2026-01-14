export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ES2022',
        moduleResolution: 'node',
        esModuleInterop: true,
      },
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@conset-pdf/core$': '<rootDir>/packages/core/src/index.ts',
    '^@conset-pdf/core/(.*)$': '<rootDir>/packages/core/src/$1',
  },
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.spec.ts'],
  collectCoverageFrom: [
    'packages/core/src/**/*.ts',
    'packages/cli/src/**/*.ts',
    'packages/gui/src/**/*.ts',
    '!**/*.d.ts',
  ],
};
