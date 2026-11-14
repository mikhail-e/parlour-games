// The room's header (the consequences/room spec, «Шапка комнаты» and «Шапка у
// ждущего новичка»): the sign and the room code's ticket in the lobby and on a
// newcomer's waiting screen; while a round is on, the valance across the top
// with the name and the code under it, on a phone and a computer alike.
// The tests' Chromium hides scrollbars, so a scrollbar that takes room (where
// 100vw is wider than the page) is not here: `overflow-x` in style.css
// answers for it, checked by hand
const {
    test, expect, text, roomWith, startRound, startedRound, writeToReading, confirmAnotherRound, askToJoin,
} = require('./helpers');

const sign = page => page.locator('.room-head .brand-sign');
const name = page => page.locator('.room-head .brand-name');
const ticket = page => page.locator('.room-head .room-ticket');

async function expectSign(page, code) {
    await expect(sign(page)).toBeVisible();
    await expect(name(page)).toBeHidden();
    await expect(ticket(page)).toBeVisible();
    await expect(page.locator('#roomCode')).toHaveText(code);
}

// The header's boxes from the top of the page, and the page's widths
function headerLayout(page) {
    return page.evaluate(() => {
        window.scrollTo(0, 0);
        const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        const html = document.documentElement;
        return {
            head: box('.room-head'),
            name: box('.room-head .brand-name'),
            ticket: box('.room-head .room-ticket'),
            width: html.clientWidth,
            scrollWidth: html.scrollWidth,
        };
    });
}

async function expectValance(page, code, lang = 'en') {
    await expect(sign(page)).toBeHidden();
    await expect(name(page)).toBeVisible();
    // As the eye sees it: capitals by the style, English in both languages
    await expect.poll(() => name(page).evaluate(element => element.innerText)).toBe('CONSEQUENCES');
    await expect(ticket(page)).toHaveText(`${text('roomCode', lang)} ${code}`);

    const { head, name: title, ticket: line, width, scrollWidth } = await headerLayout(page);
    // The ribbon from the window's top and from edge to edge, no sideways scroll
    expect(head.top).toBe(0);
    expect(head.left).toBeLessThanOrEqual(0);
    expect(head.right).toBeGreaterThanOrEqual(width);
    expect(scrollWidth).toBe(width);
    // The code under the name, both in the middle
    expect(line.top).toBeGreaterThanOrEqual(title.bottom);
    for (const box of [title, line]) {
        expect(Math.abs(box.left + box.width / 2 - width / 2)).toBeLessThan(2);
    }
}

test('the sign in the lobby, the valance while writing and reading, the sign again after Another round', async ({ newPlayer }) => {
    const { players, code } = await roomWith(newPlayer, ['Anna', 'Boris']);
    for (const player of players) await expectSign(player.page, code);

    await startRound(players);
    for (const player of players) await expectValance(player.page, code);

    await writeToReading(players);
    for (const player of players) await expectValance(player.page, code);

    for (const player of players) await player.page.locator('#readingCard .closed-sheet').first().click();
    await confirmAnotherRound(players[0]);
    for (const player of players) {
        await expect(player.page.locator('#playersCard')).toBeVisible();
        await expectSign(player.page, code);
    }
});

test('in Russian: the sign and the valance keep the English name, the code has a Russian label', async ({ newPlayer }) => {
    const locales = { Аня: 'ru-RU', Boris: 'en-GB' };
    const { players: [anya, boris], code } = await startedRound(name => newPlayer(name, { locale: locales[name] }), ['Аня', 'Boris']);

    await expectValance(anya.page, code, 'ru');
    await expectValance(boris.page, code, 'en');
});

test('a newcomer waiting for the next round sees the sign, not the valance', async ({ newPlayer }) => {
    const { players: [anna], code } = await startedRound(newPlayer, ['Anna', 'Boris']);
    const dasha = await newPlayer('Dasha');

    await askToJoin(dasha, code);

    await expect(sign(dasha.page)).toBeVisible();
    await expect(name(dasha.page)).toBeHidden();
    await expectValance(anna.page, code);
});
