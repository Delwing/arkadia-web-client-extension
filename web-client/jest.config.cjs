module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@client/(.*)$': '<rootDir>/../client/$1',
    '^zustand$': '<rootDir>/src/vendor/zustand/index.ts',
    '^zustand/vanilla$': '<rootDir>/src/vendor/zustand/vanilla.ts',
    '^zustand/middleware$': '<rootDir>/src/vendor/zustand/middleware.ts',
    '^zustand/shallow$': '<rootDir>/src/vendor/zustand/shallow.ts'
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
