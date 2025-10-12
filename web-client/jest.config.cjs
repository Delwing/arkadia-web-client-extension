const fs = require('fs');
const path = require('path');

const moduleNameMapper = {
  '^@client/(.*)$': '<rootDir>/../client/$1',
  '\\.(?:wasm)\\?url$': '<rootDir>/../client/test/__mocks__/wasmUrlMock.js',
};

const candidateZustandDirs = [
  path.join(__dirname, 'node_modules', 'zustand'),
  path.join(__dirname, '..', 'node_modules', 'zustand'),
];

const zustandDir = candidateZustandDirs.find((dir) => fs.existsSync(path.join(dir, 'package.json')));

if (zustandDir) {
  moduleNameMapper['^zustand/(.*)$'] = `${zustandDir}/$1`;
} else {
  moduleNameMapper['^zustand$'] = '<rootDir>/test/__mocks__/zustand/index.ts';
  moduleNameMapper['^zustand/(.*)$'] = '<rootDir>/test/__mocks__/zustand/$1.ts';
}

module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleDirectories: ['node_modules', '<rootDir>/../node_modules'],
  moduleNameMapper,
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
  },
};
