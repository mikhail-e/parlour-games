// The copy of the kit's public/ into a game's public/ (scripts/copy-public.js):
// it brings the game's copy to what the kit has, touches nothing of the game's
// own, and two copies at once leave whole files
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { copyPublic, KIT_PUBLIC } = require('../scripts/copy-public');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'copy-public.js');

let root;
const at = (...parts) => path.join(root, ...parts);
const write = (file, text) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
};
const read = file => fs.readFileSync(file, 'utf8');

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'room-kit-copy-'));
    write(at('kit', '_headers'), 'headers');
    write(at('kit', 'kit', 'js', 'a.js'), 'a');
    write(at('kit', 'kit', 'fonts', 'b.woff2'), 'b');
    write(at('game', 'index.html'), 'the game\'s page');
    write(at('game', 'js', 'game.js'), 'the game\'s script');
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

test('the first copy brings every file of the kit', () => {
    expect(copyPublic(at('kit'), at('game'))).toEqual({ written: 3, unchanged: 0, removed: 0 });
    expect(read(at('game', '_headers'))).toBe('headers');
    expect(read(at('game', 'kit', 'js', 'a.js'))).toBe('a');
    expect(read(at('game', 'kit', 'fonts', 'b.woff2'))).toBe('b');
});

test('a second copy writes nothing, a changed file is written again', () => {
    copyPublic(at('kit'), at('game'));
    expect(copyPublic(at('kit'), at('game'))).toEqual({ written: 0, unchanged: 3, removed: 0 });

    write(at('kit', 'kit', 'js', 'a.js'), 'a, changed');
    expect(copyPublic(at('kit'), at('game'))).toEqual({ written: 1, unchanged: 2, removed: 0 });
    expect(read(at('game', 'kit', 'js', 'a.js'))).toBe('a, changed');
});

test('a file the kit no longer has leaves the copy; the game\'s own files stay', () => {
    copyPublic(at('kit'), at('game'));
    fs.rmSync(at('kit', 'kit', 'fonts'), { recursive: true });

    expect(copyPublic(at('kit'), at('game')).removed).toBe(1);
    expect(fs.existsSync(at('game', 'kit', 'fonts'))).toBe(false);
    expect(read(at('game', 'index.html'))).toBe('the game\'s page');
    expect(read(at('game', 'js', 'game.js'))).toBe('the game\'s script');
});

test('a kit without public/kit/ leaves none in the game', () => {
    copyPublic(at('kit'), at('game'));
    fs.rmSync(at('kit', 'kit'), { recursive: true });

    expect(copyPublic(at('kit'), at('game')).removed).toBe(2);
    expect(fs.existsSync(at('game', 'kit'))).toBe(false);
    expect(read(at('game', '_headers'))).toBe('headers');
});

test('two copies at once leave whole files and no temporary ones', async () => {
    // Enough large files for the two runs to overlap
    const big = 'x'.repeat(256 * 1024);
    for (let i = 0; i < 40; i++) write(at('kit', 'kit', 'many', `${i}.txt`), `${i}${big}`);
    const run = () => promisify(execFile)(process.execPath, ['-e',
        `require(${JSON.stringify(path.join(__dirname, '..', 'scripts', 'copy-public'))}).copyPublic(${JSON.stringify(at('kit'))}, ${JSON.stringify(at('game'))})`]);

    await Promise.all([run(), run()]);

    for (let i = 0; i < 40; i++) expect(read(at('game', 'kit', 'many', `${i}.txt`))).toBe(`${i}${big}`);
    const leftovers = fs.readdirSync(at('game', 'kit'), { recursive: true }).filter(name => name.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
});

test('the command copies the kit into the folder it is given', async () => {
    const { stdout } = await promisify(execFile)(process.execPath, [SCRIPT, at('game')]);

    expect(stdout).toMatch(/^room-kit: \d+ files copied/);
    expect(fs.existsSync(at('game', '_headers'))).toBe(fs.existsSync(path.join(KIT_PUBLIC, '_headers')));
});
