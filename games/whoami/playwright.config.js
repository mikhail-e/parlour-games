// @ts-check
// Browser tests: the real game in Chromium, on a phone and on a desktop, with
// several players per room (docs/testing.md). The shared settings are the
// kit's (packages/room-kit/playwright.js): its own wrangler dev, never reused,
// the devices, the timeouts for BASE_URL (npm run test:e2e:prod).
const { defineConfig } = require('@playwright/test');
const { roomKitPlaywright } = require('@parlour-games/room-kit/playwright');

const TEST_PORT = 3100;
// A second local server whose room timers take seconds, not hours
// (tests/e2e/room-timers.spec.js; the workers inherit the address)
const FAST_TIMERS_PORT = 3101;
process.env.E2E_FAST_TIMERS_URL = `http://localhost:${FAST_TIMERS_PORT}`;

module.exports = defineConfig(roomKitPlaywright({
    port: TEST_PORT,
    servers: [
        { port: TEST_PORT, inspectorPort: 9230, state: 'whoami-e2e-state' },
        { port: FAST_TIMERS_PORT, inspectorPort: 9231, state: 'whoami-e2e-fast', vars: { ROOM_EMPTY_MS: 8000, GHOST_MS: 3000 } },
    ],
}));
