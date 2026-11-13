// How the kit's page code is written (checks.js): the names its scripts share
// are given by one of them or by the game, they build no inline code, and no
// class or id is a name an ad blocker hides.
// Each game runs the same checks on its own scripts and the kit's together
const fs = require('fs');
const os = require('os');
const path = require('path');
const { KIT_SCRIPTS, sharedNameProblems, inlineCodeProblems, blockedNameProblems } = require('../checks');

// What a game's own scripts give the kit's: the prefix of its keys in
// localStorage (its config.js) and its texts (its translations.js)
const FROM_THE_GAME = ['APP_STORAGE_PREFIX', 'translations', 'serverErrors'];

test("every name a kit script takes is given by another, or by the game", () => {
    expect(sharedNameProblems([KIT_SCRIPTS], { notFromPages: ['module', ...FROM_THE_GAME] })).toEqual([]);
});

test('the kit builds no inline event handlers or styles', () => {
    expect(inlineCodeProblems([KIT_SCRIPTS])).toEqual([]);
});

test('the checks see what they look for', () => {
    expect(sharedNameProblems([KIT_SCRIPTS])).toEqual(expect.arrayContaining([expect.stringContaining('APP_STORAGE_PREFIX')]));
});

describe('blockedNameProblems', () => {
    // A folder of files: name → text
    function folderOf(files) {
        const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'names-'));
        for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(folder, file), text);
        return folder;
    }

    test("the kit's style sheet names nothing an ad blocker hides", () => {
        expect(blockedNameProblems([])).toEqual([]);
    });

    test('finds "share" and "social" in classes and ids of the markup and in the selectors of a style sheet', () => {
        const folder = folderOf({
            'a.html': '<div id="shareCard" class="card social-links"><button class="btn story-share">Share</button></div>',
            'a.css': '.story-share { display: block; }\n#SocialBar, .icon--share:hover { color: red; }',
        });

        expect(blockedNameProblems([folder])).toEqual([
            'a.html: shareCard', 'a.html: social-links', 'a.html: story-share',
            'a.css: story-share', 'a.css: SocialBar', 'a.css: icon--share',
        ]);
    });

    test('the words in texts, keys, comments and pictures are no problem', () => {
        const folder = folderOf({
            'a.html': '<button id="inviteButton" data-i18n="share" aria-label="Share">Share the story</button>',
            'a.css': '/* .story-share was hidden */\n.x { --icon: url("data:image/svg+xml,%3Csvg class=\'share\'%3E"); }',
        });

        expect(blockedNameProblems([folder])).toEqual([]);
    });
});
