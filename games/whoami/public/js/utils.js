// The game's shared page code. What every game shares (debugLog, AppStorage,
// the player's ID and secret, the version; texts: getText; the name's and the
// photo's limits; alerts and notifications) is the kit's - app.js, i18n.js,
// limits.js, notify.js - loaded before this.
//
// The pages load their scripts as plain <script> files, so a top-level name here
// is visible to the scripts loaded after it. ESLint checks each file on its own:
// "exported" lists what other files use from here.
/* exported MAX_CHARACTER_LENGTH */

// The character's input limit. Must stay in sync with game-logic.js on the
// server (a browser script cannot require() it) - tests/input-limits.test.js
// checks this.
const MAX_CHARACTER_LENGTH = 128;
