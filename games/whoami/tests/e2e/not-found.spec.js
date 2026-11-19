// An address nobody answers gets the game's own page, public/404.html, with
// status 404: the kit's tests (packages/room-kit/e2e-kit-tests.js) on this
// game's pages and its sign
const { text } = require('./helpers');

require('@parlour-games/room-kit/e2e-kit-tests').notFoundTests({ text, brand: 'Who am I?' });
