module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'routes/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
  ],
};
