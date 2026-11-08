// @ts-check
// Browser tests: the real game in Chromium, on a phone and on a desktop, with
// several players per room (docs/testing.md). The shared settings are the
// kit's (packages/room-kit/playwright.js): its own wrangler dev, never reused,
// the devices, the timeouts for BASE_URL.
const { defineConfig } = require('@playwright/test');
const { roomKitPlaywright } = require('@parlour-games/room-kit/playwright');

// whoami's tests take 3100 and 3101: the two games' runs never meet
const TEST_PORT = 3200;
// A second local server whose room timers take seconds, not hours (the
// workers inherit the address). On the first, the pause after a step's last
// answer is next to nothing: the tests play many steps
const FAST_TIMERS_PORT = 3201;
process.env.E2E_FAST_TIMERS_URL = `http://localhost:${FAST_TIMERS_PORT}`;

module.exports = defineConfig(roomKitPlaywright({
    port: TEST_PORT,
    servers: [
        { port: TEST_PORT, inspectorPort: 9232, state: 'consequences-e2e-state', vars: { STEP_PAUSE_MS: 50 } },
        { port: FAST_TIMERS_PORT, inspectorPort: 9233, state: 'consequences-e2e-fast', vars: { ROOM_EMPTY_MS: 8000, GHOST_MS: 3000, STEP_PAUSE_MS: 3000 } },
    ],
}));
