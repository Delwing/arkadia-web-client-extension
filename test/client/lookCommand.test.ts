import {isLookCommand} from '@client/lookCommand';

describe('isLookCommand', () => {
  test.each(['sp', 'spojrz', 'zerknij', ' SP ', 'Spójrz'])('"%s" is a look', (command) => {
    expect(isLookCommand(command)).toBe(true);
  });

  test.each(['', 'n', 'sp ex', 'spojrz na goblina', 'zerknij w gore', 'l'])('"%s" is not', (command) => {
    expect(isLookCommand(command)).toBe(false);
  });
});
