// The answers are secrets until the reading: no page of the room gets the
// text of an answer while the round is written - not even its author's after
// a reload - and an open sheet goes only to who opened it, until the last one
// opens. The test reads what each page's socket receives from the room, and
// moves through the room page's own sendMove (the kit's room-page.js).
const {
    test, expect, createRoom, joinRoom, askToJoin, waitForPlayers,
    listeningPlayer, messagesOf, latestMessage: latest, sendRoomMove: move,
} = require('./helpers');
/* global socket -- the room page's socket (the kit's room-page.js), inside page.evaluate() */

async function waitForStep(players, step) {
    for (const player of players) {
        await expect.poll(() => latest(player, 'round-state')?.round?.step).toBe(step);
    }
}

test('no page gets an answer before the reading, and an open sheet only goes to who opened it', async ({ newPlayer }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'what the room sends: the device adds nothing');
    const anna = await listeningPlayer(newPlayer, 'Anna');
    const boris = await listeningPlayer(newPlayer, 'Boris');
    const players = [anna, boris];
    const code = await createRoom(anna);
    await joinRoom(boris, code);
    for (const player of players) await waitForPlayers(player.page, 2);

    await move(anna, 'start-round');
    await waitForStep(players, 0);

    const answers = [];
    for (let step = 0; step < 8; step++) {
        for (const player of players) {
            const text = `answer-of-${player.name}-${step}`;
            answers.push(text);
            await move(player, 'write-answer', { text });
        }
        // Boris's own page, reloaded in the middle of the writing, gets nothing either
        if (step === 3) {
            await boris.page.reload();
            await waitForPlayers(boris.page, 2);
        }
        await waitForStep(players, step + 1);
    }

    const leaked = player => answers.filter(text => player.received.some(payload => payload.includes(text)));
    expect(leaked(anna)).toEqual([]);
    expect(leaked(boris)).toEqual([]);

    // Anna opens her sheet: its eight answers reach her page, not Boris's
    await move(anna, 'open-sheet');
    await expect.poll(() => latest(anna, 'sheet')?.answers?.length).toBe(8);
    const annasSheet = latest(anna, 'sheet').answers;
    // Its last answer is Boris's: nobody reads the sheet they finished
    expect(annasSheet[7]).toBe('answer-of-Boris-7');
    await expect.poll(() => latest(boris, 'round-state')?.round?.opened).toBe(1);
    expect(annasSheet.filter(text => boris.received.some(payload => payload.includes(text)))).toEqual([]);

    // After a reload her page gets her sheet again
    const before = anna.received.length;
    await anna.page.reload();
    await expect.poll(() => anna.received.slice(before).some(payload => payload.includes('"event":"sheet"'))).toBe(true);
    expect(latest(anna, 'sheet').answers).toEqual(annasSheet);

    // The last sheet opens: every story reaches every page
    await move(boris, 'open-sheet');
    for (const player of players) {
        await expect.poll(() => latest(player, 'round-state')?.round?.stories?.length).toBe(2);
        expect(latest(player, 'round-state').round.stories.flatMap(story => story.answers).sort()).toEqual([...answers].sort());
    }
});

// The room's history keeps the answers of a round that reached the reading,
// once it has ended: never a round ended while writing, never the round on,
// and nothing for a newcomer's waiting page
test('the history gives away no round ended while writing, nor the round on, nor anything to a newcomer', async ({ newPlayer }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'what the room sends: the device adds nothing');
    const anna = await listeningPlayer(newPlayer, 'Anna');
    const boris = await listeningPlayer(newPlayer, 'Boris');
    const players = [anna, boris];
    const code = await createRoom(anna);
    await joinRoom(boris, code);
    for (const player of players) await waitForPlayers(player.page, 2);
    // Asking for a round that is not in the history: the page logs the room's error
    for (const player of players) player.allowConsoleError(/Socket error: No such round/);
    const askForRound = async (player, number) => {
        const errors = messagesOf(player, 'error').length;
        await move(player, 'history-round', { number });
        await expect.poll(() => messagesOf(player, 'error').length).toBe(errors + 1);
        return latest(player, 'error');
    };
    const writeSteps = async (tag, steps) => {
        for (let step = 0; step < steps; step++) {
            for (const player of players) await move(player, 'write-answer', { text: `${tag}-${player.name}-${step}` });
            await waitForStep(players, step + 1);
        }
    };
    const reached = (player, tag) => player.received.some(payload => payload.includes(`${tag}-`));

    // A round ended while writing: not in the history, its answers nowhere
    await move(anna, 'start-round');
    await waitForStep(players, 0);
    await writeSteps('broken', 3);
    await move(anna, 'new-round');
    await expect.poll(() => latest(anna, 'round-state')?.round).toBeNull();
    expect(await askForRound(anna, 1)).toBe('No such round');
    expect(players.some(player => reached(player, 'broken'))).toBe(false);

    // The round being read is not in the history until it ends: Boris, whose
    // sheet is closed, gets none of its answers by asking
    await move(anna, 'start-round');
    await waitForStep(players, 0);
    await writeSteps('read', 8);
    await move(anna, 'open-sheet');
    await expect.poll(() => latest(boris, 'round-state')?.round?.opened).toBe(1);
    expect(await askForRound(boris, 1)).toBe('No such round');
    expect(reached(boris, 'read')).toBe(false);
    await move(anna, 'new-round');
    await expect.poll(() => latest(anna, 'round-state')?.historySets?.length).toBe(1);

    // A newcomer waiting for the lobby asks for the history: the room answers nothing of it
    await move(anna, 'start-round');
    await waitForStep(players, 0);
    const vera = await listeningPlayer(newPlayer, 'Vera');
    await askToJoin(vera, code);
    vera.allowConsoleError(/Socket error: You are not in this game/);
    await vera.page.evaluate(() => socket.emit('history-round', { number: 1 }));
    await expect.poll(() => latest(vera, 'error')).toBe('You are not in this game');
    expect(messagesOf(vera, 'history-round')).toEqual([]);
    expect(reached(vera, 'read')).toBe(false);
    // And the round on is not in the history either
    expect(await askForRound(anna, 2)).toBe('No such round');
});
