// The shared part of a game's Playwright config: the real game in Chromium,
// on a phone and on a desktop. A game's playwright.config.js gives its ports
// and its servers:
//
//   module.exports = defineConfig(roomKitPlaywright({ port: 3100, servers: [{ port: 3100, inspectorPort: 9230, state: 'game-e2e-state' }] }));
//
// The tests start their own `wrangler dev` (the Worker and its rooms, as on
// Cloudflare) on the game's test port, so a running `npm start` (8787) does
// not interfere, and never reuse one: a server left running would test
// yesterday's code. The rooms' storage goes to a temporary folder, not to
// .wrangler/, where `npm start` keeps its own. With BASE_URL set (a game's
// `npm run test:e2e:prod`) the same tests run against that address and no
// server is started, hence the longer timeouts.
const os = require('os');
const path = require('path');
const { devices } = require('@playwright/test');

// A `wrangler dev` of the tests: its own port and inspector port (two servers
// at once must not share one), its rooms' storage in the temporary folder
// `state`, and variables for the Worker (a room's times shortened, say)
function wranglerDev({ port, inspectorPort, state, vars = {} }) {
    const flags = Object.entries(vars).map(([name, value]) => ` --var ${name}:${value}`).join('');
    return {
        command: `npx wrangler dev --port ${port} --inspector-port ${inspectorPort} --persist-to ${path.join(os.tmpdir(), state)}${flags}`,
        env: { WRANGLER_SEND_METRICS: 'false' },
        url: `http://localhost:${port}/api/version`,
        reuseExistingServer: false,
    };
}

// port: the server the tests open by default; servers: every wrangler dev to start
/**
 * @param {{ port: number, servers: Array<{ port: number, inspectorPort: number, state: string, vars?: Record<string, string | number> }> }} options
 * @returns {import('@playwright/test').PlaywrightTestConfig}
 */
function roomKitPlaywright({ port, servers }) {
    const BASE_URL = process.env.BASE_URL;
    /** @type {import('@playwright/test').PlaywrightTestConfig} */
    const config = {
        testDir: './tests/e2e',
        testMatch: '**/*.spec.js',
        fullyParallel: true,
        forbidOnly: !!process.env.CI,
        retries: 0,
        reporter: [['list'], ['html', { open: 'never' }]],
        timeout: BASE_URL ? 120_000 : 30_000,
        expect: { timeout: BASE_URL ? 15_000 : 5_000 },

        use: {
            baseURL: BASE_URL || `http://localhost:${port}`,
            locale: 'en-US',
            // Bootstrap skips its fade animations: modals open at once, and axe
            // never measures half-transparent text
            reducedMotion: 'reduce',
            // The service worker stays on, as for players: a game's caches only
            // its icons, and its update banner needs a new sw.js, which never
            // happens during a run. ('block' makes register() resolve to
            // nothing, and pwa.js reports that as an error a real browser never gives.)
            serviceWorkers: 'allow',
            // No traces by default. Recording one snapshots the page after every
            // action of every test, and on a full parallel run that load now and
            // then left a page not answering the recorder: a test failed with the
            // game working fine. To look into a failure: `--trace on`
            trace: 'off',
        },

        // The games are played on phones first
        projects: [
            { name: 'mobile', use: { ...devices['Pixel 7'] } },
            { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
        ],

        ...(!BASE_URL && { webServer: servers.map(wranglerDev) }),
    };
    return config;
}

module.exports = { roomKitPlaywright, wranglerDev };
