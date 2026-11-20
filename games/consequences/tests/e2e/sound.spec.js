// The sound that calls a player back (the consequences/sound spec): «Three
// notes» when a new question or the reading comes to a player who looks away
// from the game, and never otherwise. A test hears nothing: the page counts
// the sounds it plays, and is told where the player looks (helpers.js,
// soundPlayer). A browser lets a page sound only after a tap or a key on it,
// so the player touches the page first, as a person does
const {
    test, expect, text, roomWith, startRound, answer, answerText, waitForStep, writeByMoves, seatRow, QUESTION_COUNT,
    soundPlayer, soundsPlayed, lookAt, tapPage,
} = require('./helpers');

const soundRoom = (newPlayer, names) => roomWith(name => soundPlayer(newPlayer, name), names);

test('the next question calls back a player who looks away, at another tab or another window, once; a player looking at the game hears nothing', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await soundRoom(newPlayer, ['Anna', 'Boris']);
    await startRound([anna, boris]);

    // Anna answers and goes to another tab; Boris, the last, ends the step
    await answer(anna, answerText(anna, 0));
    await lookAt(anna, 'tab');
    await answer(boris, answerText(boris, 0));
    await waitForStep([anna, boris], 1);
    expect(await soundsPlayed(anna.page)).toBe(1);
    expect(await soundsPlayed(boris.page)).toBe(0);

    // The game's window on the screen, Anna in another window: a video call's
    await answer(anna, answerText(anna, 1));
    await lookAt(anna, 'window');
    await answer(boris, answerText(boris, 1));
    await waitForStep([anna, boris], 2);
    expect(await soundsPlayed(anna.page)).toBe(2);

    // Anna back at the game sees the question: no sound
    await lookAt(anna, 'here');
    await answer(anna, answerText(anna, 2));
    await answer(boris, answerText(boris, 2));
    await waitForStep([anna, boris], 3);
    expect(await soundsPlayed(anna.page)).toBe(2);
    expect(await soundsPlayed(boris.page)).toBe(0);
});

test('the first question of a round calls back a player waiting in the lobby at another tab, not the one who pressed Start', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await soundRoom(newPlayer, ['Anna', 'Boris']);
    await tapPage(anna);
    await lookAt(anna, 'tab');

    await boris.page.click('#startRound');
    await waitForStep([anna, boris], 0);

    expect(await soundsPlayed(anna.page)).toBe(1);
    expect(await soundsPlayed(boris.page)).toBe(0);
});

test('the reading calls back a player who answered the last question and looked away; back at the game, their sheet waits closed', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await soundRoom(newPlayer, ['Anna', 'Boris']);
    await startRound([anna, boris]);
    await writeByMoves([anna, boris], { to: QUESTION_COUNT - 1 });

    await answer(anna, answerText(anna, QUESTION_COUNT - 1));
    await lookAt(anna, 'tab');
    await answer(boris, answerText(boris, QUESTION_COUNT - 1));
    await waitForStep([anna, boris], QUESTION_COUNT);

    expect(await soundsPlayed(anna.page)).toBe(1);
    await lookAt(anna, 'here');
    await expect(anna.page.locator('#readingCard .closed-sheet').first()).toBeVisible();
});

test('a reload and the others\' moves inside a step play nothing: only the step\'s end calls', async ({ newPlayer }) => {
    const { players: [anna, boris, vera] } = await soundRoom(newPlayer, ['Anna', 'Boris', 'Vera']);
    await startRound([anna, boris, vera]);

    // A reload in the middle of a step: the question is the same one
    await anna.page.reload();
    await expect(anna.page.locator('#answerText')).toBeVisible();
    await answer(anna, answerText(anna, 0));
    await lookAt(anna, 'tab');
    expect(await soundsPlayed(anna.page)).toBe(0);

    // Boris answers, takes his answer back and answers again: the step goes on
    await answer(boris, answerText(boris, 0));
    await expect(seatRow(anna.page, 'Boris')).toContainText(text('statusDone'));
    await boris.page.click('#editAnswer');
    await expect(seatRow(anna.page, 'Boris')).toContainText(text('statusWriting'));
    await answer(boris, answerText(boris, 0));
    await expect(seatRow(anna.page, 'Boris')).toContainText(text('statusDone'));
    expect(await soundsPlayed(anna.page)).toBe(0);

    // Vera, the last, ends the step
    await answer(vera, answerText(vera, 0));
    await waitForStep([anna, boris, vera], 1);
    expect(await soundsPlayed(anna.page)).toBe(1);
});

test('the sound\'s switch: on at first; off, it says so with its bell struck through, and a new question plays nothing; on again, the sound plays once; the choice outlives a reload', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await soundRoom(newPlayer, ['Anna', 'Boris']);
    const soundSwitch = anna.page.locator('#soundSwitch');
    await expect(soundSwitch).toHaveText(text('soundOn'));
    await expect(soundSwitch.locator('.icon--bell')).toBeVisible();
    await startRound([anna, boris]);

    await soundSwitch.click();
    await expect(soundSwitch).toHaveText(text('soundOff'));
    await expect(soundSwitch.locator('.icon--bell-off')).toBeVisible();
    await answer(anna, answerText(anna, 0));
    await lookAt(anna, 'tab');
    await answer(boris, answerText(boris, 0));
    await waitForStep([anna, boris], 1);
    expect(await soundsPlayed(anna.page)).toBe(0);

    await lookAt(anna, 'here');
    await anna.page.reload();
    await expect(soundSwitch).toHaveText(text('soundOff'));

    await soundSwitch.click();
    await expect(soundSwitch).toHaveText(text('soundOn'));
    await expect.poll(() => soundsPlayed(anna.page)).toBe(1);
    await answer(anna, answerText(anna, 1));
    await lookAt(anna, 'tab');
    await answer(boris, answerText(boris, 1));
    await waitForStep([anna, boris], 2);
    expect(await soundsPlayed(anna.page)).toBe(2);
});

test('the sound asks no permission and loads nothing: no request of the browser\'s permissions, no file of sound, nothing from another site', async ({ newPlayer }) => {
    const { players: [anna, boris] } = await soundRoom(newPlayer, ['Anna', 'Boris']);
    const requests = [];
    anna.page.on('request', request => requests.push(request));
    await anna.page.evaluate(() => {
        window.permissionAsks = [];
        const watch = (owner, name) => {
            if (!owner || !owner[name]) return;
            const original = owner[name].bind(owner);
            owner[name] = (...args) => {
                window.permissionAsks.push(name);
                return original(...args);
            };
        };
        watch(window.Notification, 'requestPermission');
        watch(navigator.permissions, 'query');
        watch(navigator.mediaDevices, 'getUserMedia');
    });

    await startRound([anna, boris]);
    await answer(anna, answerText(anna, 0));
    await lookAt(anna, 'tab');
    await answer(boris, answerText(boris, 0));
    await waitForStep([anna, boris], 1);
    expect(await soundsPlayed(anna.page)).toBe(1);

    expect(await anna.page.evaluate(() => window.permissionAsks)).toEqual([]);
    const origin = new URL(anna.page.url()).origin;
    expect(requests.filter(request => request.resourceType() === 'media').map(request => request.url())).toEqual([]);
    expect(requests.map(request => request.url()).filter(url => !url.startsWith(origin) && !url.startsWith(origin.replace(/^http/, 'ws')))).toEqual([]);
});
