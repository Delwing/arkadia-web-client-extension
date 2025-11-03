module.exports = {
  testEnvironment: 'jsdom',
  roots: [
    '<rootDir>/test/client',
    '<rootDir>/test/web',
  ],
  setupFiles: ['<rootDir>/test/jest.setup.js'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
  moduleNameMapper: {
    '\\.(?:wasm)\\?url$': '<rootDir>/test/__mocks__/wasmUrlMock.js',
    '^@client/(.*)$': '<rootDir>/src/client/$1',
    '^@web/(.*)$': '<rootDir>/src/web/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@web-ui/(.*)$': '<rootDir>/src/ui/web/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
  },
}
