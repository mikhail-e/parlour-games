// Keep the screen awake: from the start of a round until every envelope is
// open (or Restart, Leave) the room page holds a screen wake lock, so the
// phone on the table does not go dark between questions.
//
// A test cannot see whether the screen really stays on, so navigator.wakeLock
// is replaced before the page loads by a stand-in that behaves like the
// browser's: it hands out locks, refuses one while the page is hidden, and
// drops every lock when the page leaves the screen. The last test asks the
// real Chromium instead: the stand-in cannot tell whether the page asks for
// the very thing that keeps a screen on, or whether the site's
// Permissions-Policy lets it.
const {
    test, expect, playerCard, startedGame, createRoom, joinRoom, assignCharacter, startGame, revealOwnCharacter, askToJoin,
} = require('./helpers');

// The stand-in. Call before the page loads. With refuseFirst the first request
// is refused, the way a phone refuses a lock asked for without a tap (or one
// asked for on coming back from the home screen, a WebKit bug)
async function stubWakeLock(page, { refuseFirst = false } = {}) {
    await page.addInitScript(refuse => {
        let refusals = refuse ? 1 : 0;
        let hidden = false;
        let requests = 0;
        const held = new Set();

        class WakeLockSentinel extends EventTarget {
            constructor(type) {
                super();
                this.type = type;
                this.released = false;
            }

            async release() { drop(this); }
        }

        function drop(lock) {
            if (lock.released) return;
            lock.released = true;
            held.delete(lock);
            lock.dispatchEvent(new Event('release'));
        }

        Object.defineProperty(Navigator.prototype, 'wakeLock', {
            configurable: true,
            value: {
                async request(type) {
                    requests++;
                    if (hidden || refusals > 0) {
                        refusals = Math.max(0, refusals - 1);
                        throw new DOMException('Wake Lock permission request denied', 'NotAllowedError');
                    }
                    const lock = new WakeLockSentinel(type);
                    held.add(lock);
                    return lock;
                },
            },
        });

        // The page leaves the screen (another app, the phone locked) and comes
        // back. The browser drops the page's locks as it hides it
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
        window.setPageHidden = value => {
            hidden = value;
            if (hidden) held.forEach(drop);
            document.dispatchEvent(new Event('visibilitychange'));
        };

        // requests counts every call, at the moment it is made: a check that
        // the page asked for nothing reads it right after the event
        window.wakeLockState = () => ({ requests, held: [...held].filter(lock => lock.type === 'screen').length });
    }, refuseFirst);
}

const locksHeld = player => player.page.evaluate(() => window.wakeLockState().held);
const requestsMade = player => player.page.evaluate(() => window.wakeLockState().requests);
const setPageHidden = (player, hidden) => player.page.evaluate(value => window.setPageHidden(value), hidden);

// newPlayer, with the stand-in in place before the player opens any page
const withStubbedWakeLock = (newPlayer, options) => async name => {
    const player = await newPlayer(name);
    await stubWakeLock(player.page, options);
    return player;
};

test('the screen stays awake from Start until Restart', async ({ newPlayer }) => {
    const alice = await withStubbedWakeLock(newPlayer)('Alice');
    const bob = await withStubbedWakeLock(newPlayer)('Bob');
    const code = await createRoom(alice);
    await joinRoom(bob, code);
    await assignCharacter(alice, 'Bob', 'Napoleon');
    await assignCharacter(bob, 'Alice', 'Cleopatra');
    await expect(bob.page.locator('#startGame')).toBeEnabled();

    // In the lobby players type and tap anyway: no lock
    expect(await requestsMade(alice)).toBe(0);
    expect(await requestsMade(bob)).toBe(0);

    await startGame(alice);
    // Alice pressed Start; Bob's round began with the server's message
    await expect.poll(() => locksHeld(alice)).toBe(1);
    await expect.poll(() => locksHeld(bob)).toBe(1);

    await alice.page.click('#restartGame');
    await expect(alice.page.locator('#restartModal')).toHaveClass(/\bshow\b/);
    await alice.page.click('#confirmRestart');
    await expect.poll(() => locksHeld(alice)).toBe(0);
    await expect.poll(() => locksHeld(bob)).toBe(0);
});

test('the screen may sleep once every envelope is open', async ({ newPlayer }) => {
    const { players: { Alice: alice, Bob: bob } } = await startedGame(withStubbedWakeLock(newPlayer), ['Alice', 'Bob']);
    await expect.poll(() => locksHeld(alice)).toBe(1);
    await expect.poll(() => locksHeld(bob)).toBe(1);

    // Bob is still guessing: Alice keeps looking at his tag to answer him
    await revealOwnCharacter(alice);
    await expect(playerCard(bob.page, 'Alice').locator('.character-sticker.revealed')).toBeVisible();
    expect(await locksHeld(alice)).toBe(1);
    expect(await locksHeld(bob)).toBe(1);

    // The round is over
    await revealOwnCharacter(bob);
    await expect.poll(() => locksHeld(alice)).toBe(0);
    await expect.poll(() => locksHeld(bob)).toBe(0);
});

test('coming back to the page takes the lock again', async ({ newPlayer }) => {
    const { players: { Bob: bob } } = await startedGame(withStubbedWakeLock(newPlayer), ['Alice', 'Bob']);
    await expect.poll(() => locksHeld(bob)).toBe(1);

    // Bob switches to another app: the browser drops the lock
    await setPageHidden(bob, true);
    expect(await locksHeld(bob)).toBe(0);

    await setPageHidden(bob, false);
    await expect.poll(() => locksHeld(bob)).toBe(1);
    // Coming back again while the lock is held asks for no second one
    const requests = await requestsMade(bob);
    await bob.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(await requestsMade(bob)).toBe(requests);
});

test('in the lobby neither coming back nor a tap takes a lock', async ({ newPlayer }) => {
    const { players: { Alice: alice } } = await startedGame(withStubbedWakeLock(newPlayer), ['Alice', 'Bob']);
    await alice.page.click('#restartGame');
    await expect(alice.page.locator('#restartModal')).toHaveClass(/\bshow\b/);
    await alice.page.click('#confirmRestart');
    await expect(alice.page.locator('#startGame')).toBeVisible();
    await expect.poll(() => locksHeld(alice)).toBe(0);
    const requests = await requestsMade(alice);

    await setPageHidden(alice, true);
    await setPageHidden(alice, false);
    await alice.page.locator('#gameStatus').click();

    expect(await requestsMade(alice)).toBe(requests);
});

test('a refused lock is taken by the next tap', async ({ newPlayer }) => {
    const alice = await withStubbedWakeLock(newPlayer)('Alice');
    const bob = await withStubbedWakeLock(newPlayer, { refuseFirst: true })('Bob');
    const code = await createRoom(alice);
    await joinRoom(bob, code);
    await assignCharacter(alice, 'Bob', 'Napoleon');
    await assignCharacter(bob, 'Alice', 'Cleopatra');
    await startGame(alice);

    // Bob's phone refused the lock asked for without his tap; the game goes on
    await expect(bob.page.locator('#restartGame')).toBeVisible();
    await expect.poll(() => requestsMade(bob)).toBeGreaterThanOrEqual(1);
    expect(await locksHeld(bob)).toBe(0);

    await bob.page.locator('#gameStatus').click();
    await expect.poll(() => locksHeld(bob)).toBe(1);
});

// The request lives as long as the waiting page's socket: a phone gone to
// sleep would drop it, and the players could not let the newcomer in
test('a newcomer waiting to be let in keeps the screen awake', async ({ newPlayer }) => {
    const { code } = await startedGame(newPlayer, ['Alice', 'Bob']);
    const dasha = await withStubbedWakeLock(newPlayer)('Dasha');

    await askToJoin(dasha, code);

    await expect.poll(() => locksHeld(dasha)).toBe(1);
});

test('after a reload the started round keeps the screen awake', async ({ newPlayer }) => {
    const { players: { Bob: bob } } = await startedGame(withStubbedWakeLock(newPlayer), ['Alice', 'Bob']);
    await expect.poll(() => locksHeld(bob)).toBe(1);

    await bob.page.reload();
    await expect(bob.page.locator('#restartGame')).toBeVisible();
    await expect.poll(() => locksHeld(bob)).toBe(1);
});

// Safari before 16.4, Firefox before 126: nothing to show, nothing breaks
// (the guard of newPlayer fails the test on any error of the page)
test('a browser without the Wake Lock API plays as before', async ({ newPlayer }) => {
    const withoutWakeLock = async name => {
        const player = await newPlayer(name);
        await player.page.addInitScript(() => { delete Navigator.prototype.wakeLock; });
        return player;
    };
    const { players: { Alice: alice, Bob: bob } } = await startedGame(withoutWakeLock, ['Alice', 'Bob']);
    expect(await alice.page.evaluate(() => 'wakeLock' in navigator)).toBe(false);

    await bob.page.locator('#gameStatus').click();
    await revealOwnCharacter(alice);
    await expect(playerCard(bob.page, 'Alice').locator('.character-sticker.revealed')).toBeVisible();
});

// The real browser, no stand-in: with the permission granted the page gets
// Chromium's own lock. Without it (every other test) Chromium refuses, as a
// phone in battery saver does, and that refusal must stay silent: the guard
// of newPlayer fails a test on any console.error or page error
test("the page holds the real browser's screen lock", async ({ newPlayer }) => {
    const withRealWakeLock = async name => {
        const player = await newPlayer(name);
        await player.context.grantPermissions(['screen-wake-lock']);
        // The real request is wrapped, not replaced: the test looks at the very
        // object the browser handed out
        await player.page.addInitScript(() => {
            const request = navigator.wakeLock.request.bind(navigator.wakeLock);
            window.realLocks = [];
            navigator.wakeLock.request = async type => {
                const lock = await request(type);
                window.realLocks.push(lock);
                return lock;
            };
        });
        return player;
    };
    const { players: { Bob: bob } } = await startedGame(withRealWakeLock, ['Alice', 'Bob']);

    await expect.poll(() => bob.page.evaluate(() =>
        window.realLocks.filter(lock => lock instanceof WakeLockSentinel && lock.type === 'screen' && !lock.released).length,
    )).toBe(1);
});
