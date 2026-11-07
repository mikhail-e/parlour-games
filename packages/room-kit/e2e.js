// The guard every browser test of a game runs under, and the players it
// opens: `newPlayer(name, { locale })` is a browser context of its own - its
// own localStorage, so its own player ID - on the device of the current
// project. A test fails if any player's page had a problem: a JavaScript
// error, a console.error (the Content Security Policy's blocks among them), an
// alert or confirm dialog it did not expect. A game's tests/e2e/helpers.js
// builds its own helpers on this `test`.
const base = require('@playwright/test');

// A trace Playwright records (a run with --trace on, a game's docs/testing.md)
// copies the page's images, a blob: one too, with fetch(), and the Content
// Security Policy's connect-src 'self' blocks that. A game itself never
// fetches a blob: address: this violation is the test tool's own
const TRACE_RECORDER_VIOLATION = /^Connecting to 'blob:[^']*' violates the following Content Security Policy directive: "connect-src|^Content Security Policy: connect-src blocked blob$/;

// Collect what must never happen on a player's page unless the test said so:
// a JavaScript error, a console.error, an alert/confirm dialog
function watchForProblems(player) {
    const { page, problems, expectedDialogs, allowedErrors } = player;

    page.on('pageerror', error => problems.push(`${player.name}: page error: ${error.message}`));
    page.on('console', message => {
        if (message.type() !== 'error') return;
        if (TRACE_RECORDER_VIOLATION.test(message.text())) return;
        if (allowedErrors.some(pattern => pattern.test(message.text()))) return;
        problems.push(`${player.name}: console.error: ${message.text()}`);
    });
    page.on('dialog', async dialog => {
        const expected = expectedDialogs[0];
        const matches = expected !== undefined && (expected instanceof RegExp
            ? expected.test(dialog.message())
            : dialog.message() === expected);
        if (matches) {
            expectedDialogs.shift();
            await dialog.accept();
        } else {
            problems.push(`${player.name}: unexpected ${dialog.type()}: ${dialog.message()}`);
            await dialog.dismiss();
        }
    });
}

const test = base.test.extend({
    // newPlayer(name, { locale }) opens a new browser context on the device of
    // the current project. After the test every context is closed, and the
    // test fails if any player page had a problem (see watchForProblems)
    newPlayer: async ({
        browser, baseURL, locale, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch,
        reducedMotion, serviceWorkers,
    }, use) => {
        const players = [];

        await use(async (name, options = {}) => {
            const context = await browser.newContext({
                baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, reducedMotion, serviceWorkers,
                locale: options.locale || locale,
            });
            // Whatever the Content Security Policy blocks becomes a console.error,
            // which the guard below fails on. Chromium logs a violation itself
            // too; this line names the rule and what it blocked
            await context.addInitScript(() => {
                document.addEventListener('securitypolicyviolation', event => {
                    console.error(`Content Security Policy: ${event.violatedDirective} blocked ${event.blockedURI || 'inline code'}`);
                });
            });
            const page = await context.newPage();
            const player = {
                name, page, context,
                problems: [], expectedDialogs: [], allowedErrors: [],
                // The next dialog must have this text (string: exactly, RegExp: matching); it is accepted
                expectDialog(match) { this.expectedDialogs.push(match); },
                // console.error messages matching this pattern are part of the scenario
                allowConsoleError(pattern) { this.allowedErrors.push(pattern); },
            };
            watchForProblems(player);
            players.push(player);
            return player;
        });

        await Promise.all(players.map(player => player.context.close()));
        const problems = players.flatMap(player => player.problems);
        const missedDialogs = players.flatMap(player =>
            player.expectedDialogs.map(match => `${player.name}: expected dialog never came: ${match}`));
        if (problems.length > 0 || missedDialogs.length > 0) {
            throw new Error(`Problems on the players' pages:\n${[...problems, ...missedDialogs].join('\n')}`);
        }
    },
});

const { expect } = base;

module.exports = { test, expect };
