module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'perf', 'security', 'docs', 'refactor', 'test', 'ci', 'build', 'chore', 'revert', 'style'],
    ],
    'subject-case': [0],
    'body-max-line-length': [0],
  },
};
