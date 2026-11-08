// The answers are secrets until the reading: no page of the room gets the
// text of an answer while the round is written - not even its author's after
// a reload - and an open sheet goes only to who opened it, until the last one
// opens. The test reads what each page's socket receives from the room, and
// moves through the room page's own sendMove (the kit's room-page.js).
const { test, expect, createRoom, joinRoom, waitForPlayers } = require('./helpers');
/* global sendMove -- the room page's move (the kit's room-page.js), inside page.evaluate() */

// A player whose page keeps every message its room sockets receive
async function listeningPlayer(newPlayer, name) {
    const player = await newPlayer(name);
    player.received = [];
    player.page.on('websocket', socket => socket.on('framereceived', frame => {
        if (typeof frame.payload === 'string') player.received.push(frame.payload);
    }));
    return player;
}

// The latest message of this event the page received, as data
function latest(player, event) {
    // A page's ping on a long run is answered with a bare "pong"
    const messages = player.received.filter(payload => payload !== 'pong').map(payload => JSON.parse(payload)).filter(message => message.event === event);
    return messages.length ? messages[messages.length - 1].data : null;
}

async function waitForStep(players, step) {
    for (const player of players) {
        await expect.poll(() => latest(player, 'round-state')?.round?.step).toBe(step);
    }
}

const move = (player, event, data) => player.page.evaluate(([name, payload]) => sendMove(name, payload), [event, data]);

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
