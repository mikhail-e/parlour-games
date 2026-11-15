// The room of Consequences between rounds and around them: the lobby's
// invitation and count, a page that fails to draw, a player offline in the
// middle of a round and back. The room's timers (ghosts, an empty room) are in
// room-timers.spec.js, entering from the landing page in landing.spec.js
const {
    test, expect, text, roomWith, startedRound, answer, answerStep, waitForStep, returnToRound, seatRow, questionOf,
} = require('./helpers');

// The lobby's list and a reload, leaving, in every tab, the last one out, the
// invitation (Copy Link, "Copied!", its buttons in Russian, an ad blocker), a
// message over a window: the kit's tests (packages/room-kit/e2e-kit-tests.js)
require('@parlour-games/room-kit/e2e-kit-tests').roomPageTests({ text });

// The names of the round's table, in their order
const seatedNames = page => page.locator('#seatList .seat-name').evaluateAll(names =>
    names.map(name => name.firstChild.textContent));

test('the lobby shows the invitation and how many players there are', async ({ newPlayer }) => {
    const { players } = await roomWith(newPlayer, ['Anna', 'Boris', 'Vera']);

    for (const player of players) {
        await expect(player.page.locator('#inviteCard')).toBeVisible();
        await expect(player.page.locator('#playerCount')).toHaveText('3');
    }
});

test('a page that fails to draw as it enters stays in the room, and its error is not called a connection error', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await startedRound(newPlayer, ['Anna', 'Boris']);
    // The first drawing after the reload finds no answer button, as a page does
    // whose browser kept an old script next to new markup
    await boris.page.addInitScript(() => {
        const getElementById = document.getElementById.bind(document);
        let missing = true;
        document.getElementById = id => {
            if (id === 'saveAndPass' && missing) {
                missing = false;
                return null;
            }
            return getElementById(id);
        };
    });
    boris.allowConsoleError(/^Drawing the room failed/);

    await boris.page.reload();

    // Still in the room at his question, and his page is in the room again:
    // his answer goes through
    await expect(boris.page).toHaveURL(/\/game\/[A-Z0-9]{6}$/);
    await expect(boris.page.locator('#questionText')).toHaveText(await questionOf(boris.page, 1));
    await answerStep([anna, boris], 0);
});

test('a player whose page goes is offline for the others, and comes back to their seat where the round is now', async ({ newPlayer }) => {
    const { players: [anna, boris, vera], code } = await startedRound(newPlayer, ['Anna', 'Boris', 'Vera']);

    await vera.page.close();

    await expect(seatRow(anna.page, 'Vera')).toContainText(text('statusOffline'));
    await expect(seatRow(boris.page, 'Vera')).toContainText(text('statusOffline'));
    expect(await seatedNames(anna.page)).toEqual(['Anna', 'Boris', 'Vera']);

    // The round goes on without her: Anna answers for her
    await answer(anna, 'Anna 1');
    await answer(boris, 'Boris 1');
    await seatRow(anna.page, 'Vera').getByRole('button').click();
    await answer(anna, 'for Vera 1');
    await waitForStep([anna, boris], 1);

    const back = { name: 'Vera', page: await vera.context.newPage() };
    await returnToRound(back, code);

    await expect(seatRow(anna.page, 'Vera')).not.toContainText(text('statusOffline'));
    await expect(seatRow(anna.page, 'Vera')).toContainText(text('statusWriting'));
    expect(await seatedNames(back.page)).toEqual(['Anna', 'Boris', 'Vera']);
    await expect(back.page.locator('#questionText')).toHaveText(await questionOf(back.page, 2));
    await answerStep([anna, boris, back], 1);
});

