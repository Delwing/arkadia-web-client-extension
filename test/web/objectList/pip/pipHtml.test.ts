import { splitOutputHtmlIntoLines } from '@web/objectList/pip/pipHtml';

describe('splitOutputHtmlIntoLines', () => {
  test('splits at <br> and newlines, keeping open tags balanced per line', () => {
    expect(splitOutputHtmlIntoLines('<span class="a">one<br>two\nthree</span>')).toEqual([
      '<span class="a">one</span>',
      '<span class="a">two</span>',
      '<span class="a">three</span>',
    ]);
  });

  test('drops lines with nothing visible', () => {
    expect(splitOutputHtmlIntoLines('<span>&nbsp;</span><br>text<br>\n')).toEqual(['text']);
  });
});
