// @ts-check
// Browser tests: the real game in Chromium, on a phone and on a desktop, with
// several players per room (docs/testing.md).
//
// Tests start their own `wrangler dev` (the Worker and its rooms, as on
// Cloudflare) on port 3100, so a running `npm start` (8787) does not
// interfere, and never reuse one: a server left running would test yesterday's
// code. The rooms' storage goes to a temporary folder, not to .wrangler/,
// where `npm start` keeps its own. With BASE_URL set (npm run test:e2e:prod)
// the same tests run against that address and no server is started, hence the
// longer timeouts.
const os = require('os');
const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

const TEST_PORT = 3100;
const BASE_URL = process.env.BASE_URL;
// A second local server whose room timers take seconds, not hours
// (tests/e2e/room-timers.spec.js; the workers inherit the address)
const FAST_TIMERS_PORT = 3101;
process.env.E2E_FAST_TIMERS_URL = `http://localhost:${FAST_TIMERS_PORT}`;
const wranglerDev = (port, inspectorPort, state, vars = '') =>
    `npx wrangler dev --port ${port} --inspector-port ${inspectorPort} --persist-to ${path.join(os.tmpdir(), state)}${vars}`;

module.exports = defineConfig({
    testDir: './tests/e2e',
    testMatch: '**/*.spec.js',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: 0,
    reporter: [['list'], ['html', { open: 'never' }]],
    timeout: BASE_URL ? 120_000 : 30_000,
    expect: { timeout: BASE_URL ? 15_000 : 5_000 },

    use: {
        baseURL: BASE_URL || `http://localhost:${TEST_PORT}`,
        locale: 'en-US',
        // Bootstrap skips its fade animations: modals open at once, and axe
        // never measures half-transparent text
        reducedMotion: 'reduce',
        // The service worker stays on, as for players: it only caches icons, and
        // its update banner needs a new sw.js, which never happens during a run.
        // ('block' makes register() resolve to nothing, and pwa.js reports that
        // as an error a real browser never gives.)
        serviceWorkers: 'allow',
        // No traces by default. Recording one snapshots the page after every
        // action of every test, and on a full parallel run that load now and
        // then left a page not answering the recorder: a test failed with the
        // game working fine. To look into a failure: `--trace on`
        trace: 'off',
    },

    // The game is played on phones first
    projects: [
        { name: 'mobile', use: { ...devices['Pixel 7'] } },
        { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    ],

    ...(!BASE_URL && {
        webServer: [
            {
                command: wranglerDev(TEST_PORT, 9230, 'whoami-e2e-state'),
                env: { WRANGLER_SEND_METRICS: 'false' },
                url: `http://localhost:${TEST_PORT}/api/version`,
                reuseExistingServer: false,
            },
            {
                command: wranglerDev(FAST_TIMERS_PORT, 9231, 'whoami-e2e-fast', ' --var ROOM_EMPTY_MS:6000 --var GHOST_MS:3000'),
                env: { WRANGLER_SEND_METRICS: 'false' },
                url: `http://localhost:${FAST_TIMERS_PORT}/api/version`,
                reuseExistingServer: false,
            },
        ],
    }),
});
