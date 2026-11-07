/**
 * debugLog() tests
 * The pages print their debug output through debugLog() (the kit's app.js),
 * not console.log: players' consoles stay quiet unless debugging is turned on
 * with localStorage '<the game's prefix>-debug' = 'on'. ESLint (no-console)
 * keeps console.log out of the pages; these tests run the real app.js.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'kit', 'js', 'app.js'), 'utf8');

// The prefix a game's config.js gives (whoami's is 'whoami')
const PREFIX = 'some-game';

// Run app.js the way a page does, after the game's config.js, with a stored
// localStorage and a console that records what is printed
function loadApp(stored = {}) {
    const values = {
        playerId: '123e4567-e89b-42d3-a456-426614174000',
        [`${PREFIX}-player-secret`]: '00000000-0000-4000-8000-000000000001',
        ...stored
    };
    const printed = [];
    const page = {
        APP_STORAGE_PREFIX: PREFIX,
        localStorage: {
            getItem: (key) => (key in values ? values[key] : null),
            setItem: (key, value) => { values[key] = String(value); }
        },
        console: { log: (...args) => printed.push(args), warn() {}, error() {} },
        document: { addEventListener() {} }
    };
    vm.createContext(page);
    vm.runInContext(appSource, page);
    return { page, printed };
}

describe('debugLog()', () => {
    test('prints nothing while debugging is off', () => {
        const { page, printed } = loadApp();

        page.debugLog('state', { players: 2 });

        expect(printed).toEqual([]);
    });

    test("prints to the console when localStorage '<prefix>-debug' is 'on'", () => {
        const { page, printed } = loadApp({ [`${PREFIX}-debug`]: 'on' });

        page.debugLog('state', { players: 2 });

        expect(printed).toContainEqual(['state', { players: 2 }]);
    });

    // A browser that blocks site data throws on any localStorage access. The
    // debug switch must never be what stops the page script.
    test('stays off, and callable, when the browser blocks storage', () => {
        const printed = [];
        const page = {
            APP_STORAGE_PREFIX: PREFIX,
            localStorage: { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } },
            console: { log: (...args) => printed.push(args), warn() {}, error() {} },
            document: { addEventListener() {} }
        };
        vm.createContext(page);
        try {
            vm.runInContext(appSource, page);
        } catch {
            // the player ID still needs storage: that part fails, as it always did
        }

        expect(() => page.debugLog('state')).not.toThrow();
        expect(printed).toEqual([]);
    });
});

describe("the player's ID and secret", () => {
    test('are read under playerId and the game\'s prefix', () => {
        const { page } = loadApp();

        expect(vm.runInContext('PLAYER_ID', page)).toBe('123e4567-e89b-42d3-a456-426614174000');
        expect(vm.runInContext('PLAYER_SECRET', page)).toBe('00000000-0000-4000-8000-000000000001');
    });
});
