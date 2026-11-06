// Checks of public/css/style.css, read by the browser itself (CSSOM): what the
// browser accepted is what players get
const { test, expect, waitForLanding } = require('./helpers');

// Every rule of the game's stylesheet, with the @media conditions around it
async function readAppRules(page) {
    return page.evaluate(() => {
        const sheet = [...document.styleSheets].find(s => s.href && s.href.endsWith('/css/style.css'));
        const rules = [];
        const walk = (ruleList, media) => {
            for (const rule of ruleList) {
                if (rule instanceof CSSStyleRule) {
                    rules.push({ selector: rule.selectorText, media });
                }
                // Rules inside @supports, @layer or a nested rule count too;
                // only @media adds a condition
                if (rule.cssRules) {
                    walk(rule.cssRules, rule instanceof CSSMediaRule ? [...media, rule.conditionText] : media);
                }
            }
        };
        walk(sheet.cssRules, []);
        return rules;
    });
}

// On a touch screen :hover sticks after a tap (CLAUDE.md: hover effects only with a mouse)
test('every :hover rule applies only with a mouse', async ({ newPlayer }) => {
    const { page } = await newPlayer('Alice');
    await page.goto('/');
    await waitForLanding(page);

    const rules = await readAppRules(page);
    const touchHover = rules
        .filter(rule => rule.selector.includes(':hover'))
        .filter(rule => !rule.media.some(condition => condition.includes('(hover: hover)') && condition.includes('(pointer: fine)')))
        .map(rule => rule.selector);

    expect(rules.length).toBeGreaterThan(0);
    expect(touchHover).toEqual([]);
});

// The game draws with its own fonts (public/fonts/): a missing file or a CSP
// block would silently fall back to a system font, Cyrillic first of all
test('the pages draw with their own fonts, Cyrillic included', async ({ newPlayer }) => {
    const { page } = await newPlayer('Алиса', { locale: 'ru-RU' });
    await page.goto('/');
    await waitForLanding(page);

    const loaded = await page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts].filter(face => face.status === 'loaded').map(face =>
            `${face.family.replace(/["']/g, '')} ${face.weight} ${/U\+0?400/i.test(face.unicodeRange) ? 'cyrillic' : 'latin'}`);
    });

    expect(loaded).toEqual(expect.arrayContaining([
        'Fira Sans Condensed 400 latin', 'Fira Sans Condensed 400 cyrillic', 'Fira Sans Condensed 600 cyrillic',
        // The sign: its name and its two small lines
        'Ultra 400 latin', 'Oswald 600 latin',
    ]));
});
