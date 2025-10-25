module.exports = {
  testEnvironment: 'jsdom',
  roots: [
    '<rootDir>/test',
  ],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {},
    ],
  },
  moduleNameMapper: {
    '\\.(?:wasm)\\?url$': '<rootDir>/test/__mocks__/wasmUrlMock.js',
    '^@client/(.*)$': '<rootDir>/$1',
    '^zustand$': '<rootDir>/test/__mocks__/zustand.ts',
    '^zustand/vanilla$': '<rootDir>/test/__mocks__/zustandVanilla.ts',
    '^zustand/middleware$': '<rootDir>/test/__mocks__/zustandMiddleware.ts',
  },
}
