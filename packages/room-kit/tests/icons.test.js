// The icons of the pages (checks.js, emojiProblems and iconProblems): emoji
// are only the players' avatars, and an icon that is named is drawn. Each game
// runs them on its own folders; here they read the kit's, and made-up folders,
// right and wrong
const fs = require('fs');
const os = require('os');
const path = require('path');
const { KIT_SCRIPTS, emojiProblems, iconProblems } = require('../checks');

const KIT_STYLES = path.join(__dirname, '..', 'public', 'kit', 'css');

const SVG = "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cpath d='M1'/%3E%3C/svg%3E";
const PICTURE = (name, picture = SVG) => `.icon--${name} { /* check */ --icon: url("data:image/svg+xml,${picture}"); }`;

// A folder of files: name → text
function folderOf(files) {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-'));
    for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(folder, file), text);
    return folder;
}

describe('emojiProblems', () => {
    test('the kit shows none outside the avatars', () => {
        expect(emojiProblems([KIT_SCRIPTS, KIT_STYLES])).toEqual([]);
    });

    test('finds them in markup, texts and styles, flags and emoji with a variation sign among them', () => {
        const folder = folderOf({
            'a.html': '<p>fine</p>\n<button>🚪 Leave</button>',
            'b.js': 'const warn = "⚠️ Careful";\nconst lang = "🇬🇧 English";',
            'c.css': ".x::before { content: '✅'; }"
        });

        expect(emojiProblems([folder])).toEqual([
            'a.html:2: <button>🚪 Leave</button>',
            'b.js:1: const warn = "⚠️ Careful";',
            'b.js:2: const lang = "🇬🇧 English";',
            "c.css:1: .x::before { content: '✅'; }"
        ]);
    });

    test('text glyphs, the console and the avatars are no problem', () => {
        const folder = folderOf({
            'a.js': "const done = '✓ ★ → ©';\ndebugLog('🆕 update');\nconsole.error('❌ failed');",
            'a.html': '<input type="hidden" id="selectedAvatar" value="😀">',
            'landing.js': "const AVATARS = ['🐌', '🐧'];"
        });

        expect(emojiProblems([folder])).toEqual([]);
    });
});

describe('iconProblems', () => {
    test('every icon the kit names is drawn', () => {
        expect(iconProblems([])).toEqual([]);
    });

    test('an icon of a game, styled in its own sheet, is right', () => {
        const folder = folderOf({
            'a.html': '<span class="icon icon--mine"></span>',
            'a.css': PICTURE('mine')
        });

        expect(iconProblems([folder])).toEqual([]);
    });

    test('finds a name without a style, in markup and in scripts', () => {
        const folder = folderOf({
            'a.html': '<span class="icon icon--nope"></span>',
            'a.js': "createIcon('gone'); showNotification(text, 'info', { icon: 'lost' });"
        });

        expect(iconProblems([folder])).toEqual(expect.arrayContaining([
            'icon "nope" has no style', 'icon "gone" has no style', 'icon "lost" has no style'
        ]));
    });

    test('finds a picture that cannot be drawn: not a whole drawing, or not encoded', () => {
        const folder = folderOf({
            'a.css': [PICTURE('cut', SVG.slice(0, 40)), PICTURE('raw', "<svg viewBox='0 0 1 1'></svg>")].join('\n')
        });

        expect(iconProblems([folder])).toEqual(['icon "cut": a broken picture', 'icon "raw": a broken picture']);
    });
});
