module.exports = {
  testEnvironment: 'jsdom',
  roots: [
    '<rootDir>/test',
  ],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
      },
    ],
  },
  moduleNameMapper: {
    '^@client/(.*)$': '<rootDir>/$1',
    '^@options/(.*)$': '<rootDir>/../options/$1',
    '^@map/(.*)$': '<rootDir>/../map/$1'
  },
}
