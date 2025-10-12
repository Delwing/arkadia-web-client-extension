const path = require('path');

const zustandBaseDir = path.dirname(require.resolve('zustand/package.json'));

module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleDirectories: ['node_modules', '<rootDir>/../node_modules'],
  moduleNameMapper: {
    '^@client/(.*)$': '<rootDir>/../client/$1',
    '^zustand/(.*)$': `${zustandBaseDir}/$1`,
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
  },
};
