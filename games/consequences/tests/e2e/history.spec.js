// The room's history (openspec consequences/history): a round that reached
// the reading is kept when it ends, every story whole with who read it, and a
// player's page gets a round of it when it asks (history-round). What the
// room sends is read off the pages' sockets; the moves go through the room
// page's own sendMove (the kit's room-page.js).
const {
    test, expect, createRoom, joinRoom, waitForPlayers, waitForStep,
    listeningPlayer, messagesOf, latestMessage: latest, sendRoomMove: move,
} = require('./helpers');

// Every player answers every question, "<tag>-<name>-<step>": the round is at the reading
async function writeByMoves(players, tag) {
    for (let step = 0; step < 8; step++) {
        for (const player of players) await move(player, 'write-answer', { text: `${tag}-${player.name}-${step}` });
        await waitForStep(players, step + 1);
    }
}

// The answers of sheet j of a round writeByMoves wrote: at step s the sheet
// lies in front of seat (j + s) mod N
const sheetAnswers = (players, tag, sheet) => Array.from({ length: 8 },
    (unused, step) => `${tag}-${players[(sheet + step) % players.length].name}-${step}`);

// The round just started: its set of questions, as the room sent it
async function startedSet(players) {
    await move(players[0], 'start-round');
    await waitForStep(players, 0);
    return latest(players[0], 'round-state').round.questionSet;
}

test('the room keeps every round that reached the reading, and a page gets the one it asks for', async ({ newPlayer }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'what the room sends: the device adds nothing');
    const anna = await listeningPlayer(newPlayer, 'Anna');
    const boris = await listeningPlayer(newPlayer, 'Boris');
    const players = [anna, boris];
    const code = await createRoom(anna);
    await joinRoom(boris, code);
    for (const player of players) await waitForPlayers(player.page, 2);
    const historySets = player => latest(player, 'round-state')?.historySets;

    // Round 1: every sheet read, then "Another round"
    const sets = [await startedSet(players)];
    await writeByMoves(players, 'r1');
    for (const player of players) await move(player, 'open-sheet');
    await expect.poll(() => latest(anna, 'round-state')?.round?.stories?.length).toBe(2);
    await move(boris, 'new-round');
    for (const player of players) await expect.poll(() => historySets(player)).toEqual(sets);

    // Round 2: "New round" in the middle of the reading, Boris's sheet not open
    sets.push(await startedSet(players));
    await writeByMoves(players, 'r2');
    await move(anna, 'open-sheet');
    await expect.poll(() => latest(boris, 'round-state')?.round?.opened).toBe(1);
    await move(anna, 'new-round');
    for (const player of players) await expect.poll(() => historySets(player)).toEqual(sets);

    // Round 3: ended while writing - not kept
    await startedSet(players);
    for (const player of players) await move(player, 'write-answer', { text: `r3-${player.name}-0` });
    await waitForStep(players, 1);
    await move(anna, 'new-round');
    await expect.poll(() => latest(anna, 'round-state')?.round).toBeNull();
    expect(historySets(anna)).toEqual(sets);

    // Boris asks for each round of the history: two players, so sheet j is read at seat j
    await move(boris, 'history-round', { number: 1 });
    await expect.poll(() => latest(boris, 'history-round')?.number).toBe(1);
    expect(latest(boris, 'history-round').round).toEqual({
        questionSet: sets[0],
        stories: [0, 1].map(sheet => ({ answers: sheetAnswers(players, 'r1', sheet), readBy: players[sheet].name })),
    });
    await move(boris, 'history-round', { number: 2 });
    await expect.poll(() => latest(boris, 'history-round')?.number).toBe(2);
    expect(latest(boris, 'history-round').round).toEqual({
        questionSet: sets[1],
        stories: [{ answers: sheetAnswers(players, 'r2', 0), readBy: 'Anna' }, { answers: sheetAnswers(players, 'r2', 1), readBy: null }],
    });
    // Only the asker's page gets it
    expect(messagesOf(anna, 'history-round')).toEqual([]);

    // A number outside the history, or not a number, is no round (the page logs the room's error)
    boris.allowConsoleError(/Socket error: No such round/);
    for (const number of [0, 3, '1']) {
        const errors = messagesOf(boris, 'error').length;
        await move(boris, 'history-round', { number });
        await expect.poll(() => messagesOf(boris, 'error').length).toBe(errors + 1);
        expect(latest(boris, 'error')).toBe('No such round');
    }
    expect(messagesOf(boris, 'history-round')).toHaveLength(2);
});
