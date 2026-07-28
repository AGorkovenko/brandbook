const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1480, height: 420 }, deviceScaleFactor: 3
  });
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.waitForTimeout(700);
  const out = path.join(__dirname, 'out.png');
  await page.screenshot({ path: out });
  await browser.close();
  console.log('→ ' + out);
})();
