// The site around the game: only its own code, the security headers, the
// version in the footer, the icons, the service worker and its update banner -
// the kit's tests (packages/room-kit/e2e-kit-tests.js) on this game's pages
const { text } = require('./helpers');

require('@parlour-games/room-kit/e2e-kit-tests').siteTests({ text });
