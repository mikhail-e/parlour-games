// The game's shared page code. What every game shares (debugLog, AppStorage,
// the player's ID and secret, the version; texts: getText; the name's and the
// photo's limits; alerts and notifications) is the kit's - app.js, i18n.js,
// limits.js, notify.js - loaded before this.
//
// The pages load their scripts as plain <script> files, so a top-level name here
// is visible to the scripts loaded after it. ESLint checks each file on its own:
// "exported" lists what other files use from here.
/* exported MAX_ANSWER_LENGTH */

// The answer's limit, counted in characters as a person counts them (an emoji
// is one). The server's is in game-logic.js (a browser script cannot require()
// it); tests/input-limits.test.js keeps the two equal.
const MAX_ANSWER_LENGTH = 200;
