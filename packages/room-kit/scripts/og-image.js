#!/usr/bin/env node
// Takes a game's link preview picture from its source, scripts/og-image.html,
// with the sign of its landing page put in. Run in the game's folder after a
// change to the source or to the game's look:
//
//   npm run og-image         (the game's script: room-kit-og-image)
//
// The picture goes where the landing page's og:image points (public/img/...):
// a new look gets a new file name there, as messengers keep a picture by its
// address, and the command follows it.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');

const GAME = process.cwd();
const SOURCE = path.join(GAME, 'scripts', 'og-image.html');
// The sign is taken from the landing page, not copied into the source: a copy
// would drift from the drawing players see
const LANDING = path.join(GAME, 'public', 'index.html');

async function main() {
    if (!fs.existsSync(SOURCE) || !fs.existsSync(LANDING)) {
        console.error('No scripts/og-image.html or public/index.html here: run this in a game\'s folder');
        process.exit(1);
    }
    const landing = fs.readFileSync(LANDING, 'utf8');
    const address = landing.match(/<meta property="og:image" content="([^"]+)">/)[1];
    const picture = path.join(GAME, 'public', ...new URL(address).pathname.split('/'));
    const sign = landing.match(/<svg class="brand-sign"[\s\S]*?<\/svg>/)[0];

    const browser = await chromium.launch();
    // The size of a preview picture (og:image:width/height in the pages)
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.goto(pathToFileURL(SOURCE).href);
    await page.locator('.sign-slot').evaluate((slot, svg) => { slot.innerHTML = svg; }, sign);
    await page.evaluate(() => document.fonts.ready);
    // Quality 90 keeps the picture well under WhatsApp's limit (a game's link-preview test)
    await page.screenshot({ path: picture, type: 'jpeg', quality: 90 });
    await browser.close();
    console.log(`Saved ${path.relative(GAME, picture)}`);
}

main();
