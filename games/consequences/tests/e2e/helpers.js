// Helpers for the game's browser tests (docs/testing.md). Every player is a
// browser context of their own - their own localStorage, so their own player
// ID - and every helper acts the way a person would: through pages and buttons.
// The guard and the players are the kit's (packages/room-kit/e2e.js), and so
// are the helpers that act through the kit's pages - the landing form,
// entering and leaving a room, the invitation, the socket
// (packages/room-kit/e2e-helpers.js).
const path = require('path');
const { test, expect } = require('@parlour-games/room-kit/e2e');
const { pageTexts, ...kitHelpers } = require('@parlour-games/room-kit/e2e-helpers');

// The texts of the game's pages, the kit's under them
const { text, serverErrorText } = pageTexts(path.join(__dirname, '..', '..', 'public', 'js', 'translations.js'));

module.exports = {
    test,
    expect,
    text,
    serverErrorText,
    ...kitHelpers,
};
