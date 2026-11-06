// Takes the app's icons from scripts/icon.html: the PNGs the manifest names,
// the iPhone's home-screen icon and favicon.ico. Run it after a change to the
// drawing: node scripts/icons.js
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');

const SOURCE = path.join(__dirname, 'icon.html');
const PUBLIC = path.join(__dirname, '..', 'public');

// The manifest's icons (public/manifest.json), the iPhone's (an SVG there is
// ignored: apple-touch-icon must be a PNG) and the favicon's sizes
const PNGS = {
    48: 'icons/icon-48x48.png',
    72: 'icons/icon-72x72.png',
    96: 'icons/icon-96x96.png',
    144: 'icons/icon-144x144.png',
    192: 'icons/icon-192x192.png',
    512: 'icons/icon-512x512.png',
    180: 'icons/apple-touch-icon.png',
};
const FAVICON_SIZES = [16, 32, 48];

// An ICO file is a 6-byte header, a 16-byte entry per image, then the images;
// browsers take PNG images inside it, so no image library is needed
function icoFrom(pngs) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(pngs.length, 4);
    let offset = 6 + 16 * pngs.length;
    const entries = pngs.map(({ size, data }) => {
        const entry = Buffer.alloc(16);
        entry[0] = size % 256; // width, 0 means 256
        entry[1] = size % 256; // height
        entry.writeUInt16LE(1, 4); // color planes
        entry.writeUInt16LE(32, 6); // bits per pixel
        entry.writeUInt32LE(data.length, 8);
        entry.writeUInt32LE(offset, 12);
        offset += data.length;
        return entry;
    });
    return Buffer.concat([header, ...entries, ...pngs.map(png => png.data)]);
}

async function main() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(pathToFileURL(SOURCE).href);
    await page.evaluate(() => document.fonts.ready);

    const shots = {};
    const sizes = [...new Set([...Object.keys(PNGS).map(Number), ...FAVICON_SIZES])];
    for (const size of sizes) {
        await page.setViewportSize({ width: size, height: size });
        shots[size] = await page.screenshot({ type: 'png' });
    }
    await browser.close();

    for (const [size, file] of Object.entries(PNGS)) {
        fs.writeFileSync(path.join(PUBLIC, file), shots[size]);
        console.log(`Saved public/${file}`);
    }
    fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), icoFrom(FAVICON_SIZES.map(size => ({ size, data: shots[size] }))));
    console.log('Saved public/favicon.ico');
}

main();
