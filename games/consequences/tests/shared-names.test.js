/**
 * Shared names between the page scripts
 * The pages load plain <script> files - the game's and the kit's - that share
 * top-level names (the kit's CLAUDE.md, Rules): a file lists what it takes
 * from the others in a "global" comment and what it gives in an "exported"
 * comment. ESLint checks each file on its own, so it cannot see these lists
 * drift apart; the kit's check can.
 */
const path = require('path');
const { KIT_SCRIPTS, sharedNameProblems } = require('@parlour-games/room-kit/checks');

test('every name a script takes from another file is given by one, and declared there', () => {
    expect(sharedNameProblems([path.join(__dirname, '..', 'public', 'js'), KIT_SCRIPTS])).toEqual([]);
});
