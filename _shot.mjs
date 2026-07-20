import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage();
await p.setViewportSize({ width: 1200, height: 800 });
await p.goto('http://localhost:4174/forge-ui/');
await p.locator('.forge-menu__button').click();
await p.locator('.forge-menu__list').getByRole('button', { name: 'Aliasy' }).click();
await p.locator('.forge-menu-modal').waitFor();
await p.getByRole('button', { name: 'Dodaj alias' }).click();
await p.waitForTimeout(400);
await p.screenshot({ path: '/tmp/claude-0/-home-user-arkadia-web-client-extension/73d6ebd4-013a-57d6-b563-0cf02fcc8ab1/scratchpad/alias-add.png' });
// measurements
const m = await p.evaluate(() => {
  const modal = document.querySelector('.forge-menu-modal .modal');
  const content = document.querySelector('.forge-menu-modal .modal-content');
  const header = document.querySelector('.forge-menu-modal .modal-header');
  const cs = (el) => el ? getComputedStyle(el) : null;
  return {
    modalPos: cs(modal)?.position,
    modalRect: modal?.getBoundingClientRect(),
    contentBg: cs(content)?.backgroundColor,
    contentRect: content?.getBoundingClientRect(),
    headerDisplay: cs(header)?.display,
    headerJustify: cs(header)?.justifyContent,
  };
});
console.log(JSON.stringify(m, null, 2));
await b.close();
