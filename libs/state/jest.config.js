module.exports = {
  name: 'state',
  displayName: 'state',
  preset: '../../jest.preset.js',
  coverageReporters: ['lcov', 'cobertura'],
  coverageDirectory: '../../docs/test-coverage/state',
  collectCoverageFrom: [
    './src/**/!(index).ts',
    '!./src/lib/experimental/**/*.ts',
  ],
  snapshotSerializers: [
    'jest-preset-angular/build/AngularNoNgAttributesSnapshotSerializer.js',
    'jest-preset-angular/build/AngularSnapshotSerializer.js',
    'jest-preset-angular/build/HTMLCommentSerializer.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  globals: {
    'ts-jest': {
      tsConfig: '<rootDir>/tsconfig.spec.json',
      stringifyContentPathRegex: '\\.(html|svg)$',
      astTransformers: {
        before: [
          'jest-preset-angular/build/InlineFilesTransformer',
          'jest-preset-angular/build/StripStylesTransformer',
        ],
      },
    },
  },
};
