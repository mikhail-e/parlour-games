/**
 * debugLog() tests
 * The pages print their debug output through debugLog() (utils.js), not
 * console.log: players' consoles stay quiet unless debugging is turned on with
 * localStorage 'whoami-debug' = 'on'. ESLint (no-console) keeps console.log out
 * of the pages; these tests run the real utils.js.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const utilsSource = fs.readFileSync(path.join(__dirname, '..', 'public/js/utils.js'), 'utf8');

// Run utils.js the way a page does, with a stored localStorage and a console
// that records what is printed
function loadUtils(stored = {}) {
    const values = {
        playerId: '123e4567-e89b-42d3-a456-426614174000',
        'whoami-player-secret': '00000000-0000-4000-8000-000000000001',
        ...stored
    };
    const printed = [];
    const page = {
        localStorage: {
            getItem: (key) => (key in values ? values[key] : null),
            setItem: (key, value) => { values[key] = String(value); }
        },
        console: { log: (...args) => printed.push(args), warn() {}, error() {} },
        document: { addEventListener() {} }
    };
    vm.createContext(page);
    vm.runInContext(utilsSource, page);
    return { page, printed };
}

describe('debugLog()', () => {
    test('prints nothing while debugging is off', () => {
        const { page, printed } = loadUtils();

        page.debugLog('state', { players: 2 });

        expect(printed).toEqual([]);
    });

    test("prints to the console when localStorage 'whoami-debug' is 'on'", () => {
        const { page, printed } = loadUtils({ 'whoami-debug': 'on' });

        page.debugLog('state', { players: 2 });

        expect(printed).toContainEqual(['state', { players: 2 }]);
    });

    // A browser that blocks site data throws on any localStorage access. The
    // debug switch must never be what stops the page script.
    test('stays off, and callable, when the browser blocks storage', () => {
        const printed = [];
        const page = {
            localStorage: { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } },
            console: { log: (...args) => printed.push(args), warn() {}, error() {} },
            document: { addEventListener() {} }
        };
        vm.createContext(page);
        try {
            vm.runInContext(utilsSource, page);
        } catch {
            // the player ID still needs storage: that part fails, as it always did
        }

        expect(() => page.debugLog('state')).not.toThrow();
        expect(printed).toEqual([]);
    });
});
