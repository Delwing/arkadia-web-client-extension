import { buildPipHtml, splitOutputHtmlIntoLines } from '@web/objectList/pip/pipHtml';

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

describe('buildPipHtml', () => {
  test('omits the header and footer when they have nothing to show', () => {
    expect(buildPipHtml({ locationText: '', coverTimerText: '', bodyLines: ['a', 'b'], lastOutputHtml: '' }))
      .toBe('<div class="objects-list-pip-body">a<br>b</div>');
  });

  test('escapes the header text and joins its parts', () => {
    const html = buildPipHtml({ locationText: '<Gate>', coverTimerText: 'Zas: OK', bodyLines: [], lastOutputHtml: '<b>x</b>' });
    expect(html).toContain('<div class="objects-list-pip-header">&lt;Gate&gt;&nbsp;&bull;&nbsp;Zas: OK</div>');
    expect(html).toContain('<div class="objects-list-pip-footer-content"><b>x</b></div>');
  });
});
