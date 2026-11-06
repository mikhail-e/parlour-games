// Takes the link preview picture: scripts/og-image.html → public/img/og-image-2.jpg
// (docs/publishing.md). Run it after a change to the source or to the game's
// look: node scripts/og-image.js
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');

const SOURCE = path.join(__dirname, 'og-image.html');
// A new look gets a new file name: messengers keep a picture by its address
const PICTURE = path.join(__dirname, '..', 'public', 'img', 'og-image-2.jpg');
// The sign is taken from the landing page, not copied into the source: a copy
// would drift from the drawing players see
const LANDING = path.join(__dirname, '..', 'public', 'index.html');

async function main() {
    const browser = await chromium.launch();
    // The size of a preview picture (og:image:width/height in the pages)
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.goto(pathToFileURL(SOURCE).href);
    const sign = fs.readFileSync(LANDING, 'utf8').match(/<svg class="brand-sign"[\s\S]*?<\/svg>/)[0];
    await page.locator('.sign-slot').evaluate((slot, svg) => { slot.innerHTML = svg; }, sign);
    await page.evaluate(() => document.fonts.ready);
    // Quality 90 keeps the picture well under WhatsApp's limit (tests/e2e/link-preview.spec.js)
    await page.screenshot({ path: PICTURE, type: 'jpeg', quality: 90 });
    await browser.close();
    console.log(`Saved ${path.relative(process.cwd(), PICTURE)}`);
}

main();
