// Растеризує прототип у PNG високої роздільності.
// Той самий механізм у пайплайні: мокапи композитяться окремим кроком
// і потрапляють у HTML брендбуку вже готовим растром — інакше друк PDF
// растеризує SVG-фільтри в екранні 96 dpi.
//
//   node prototypes/mockup-warp/render.js

const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1560, height: 520 },
    deviceScaleFactor: 3            // 3× — достатньо для друку 300 dpi
  });
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.waitForTimeout(600);   // дочекатись растеризації фільтрів
  const out = path.join(__dirname, 'out.png');
  await page.screenshot({ path: out });
  await browser.close();
  console.log('→ ' + out);
})();
