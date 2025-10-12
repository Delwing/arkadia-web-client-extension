module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleDirectories: ['node_modules', '<rootDir>/../node_modules'],
  moduleNameMapper: {
    '^@client/(.*)$': '<rootDir>/../client/$1',
    '^zustand/(.*)$': '<rootDir>/../node_modules/zustand/$1',
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
