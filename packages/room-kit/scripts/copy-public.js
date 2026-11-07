#!/usr/bin/env node
// Lays the kit's public/ over a game's public/: the kit's scripts, Bootstrap,
// fonts (public/kit/) and the static files' security headers (public/_headers).
// Cloudflare serves a Worker's static files from one folder only, the game's
// public/, so the kit's files are copied there; the copies are not in git and
// are never edited in a game (CLAUDE.md, "The copy in a game's public/").
//
//   room-kit-copy-public <the game's public folder>
//
// A game runs it as its `build` script: wrangler runs that before `wrangler dev`
// and `wrangler deploy` (wrangler.jsonc, "build"), Workers Builds as its Build
// command as well.
//
// Two copies may run at once (the browser tests start two `wrangler dev`), so a
// file is written only when it differs, through a temporary file renamed into
// place: a server never reads a half-written file. What the kit no longer has
// is removed from the game's copy.
const fs = require('fs');
const path = require('path');

const KIT_PUBLIC = path.join(__dirname, '..', 'public');
// The folder of a game's public/ that is all the kit's
const OWNED_FOLDER = 'kit';
// Files the kit never ships (a Mac's folder settings)
const SKIPPED = new Set(['.DS_Store']);

// Every file under dir, as paths relative to it
function filesUnder(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        if (SKIPPED.has(entry.name)) return [];
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return filesUnder(full).map(file => path.join(entry.name, file));
        return entry.isFile() ? [entry.name] : [];
    });
}

function sameContent(file, bytes) {
    try {
        return fs.readFileSync(file).equals(bytes);
    } catch {
        return false;
    }
}

function writeAtomically(file, bytes) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
    fs.writeFileSync(temporary, bytes);
    fs.renameSync(temporary, file);
}

// Removes empty folders under dir, dir itself included
function removeEmptyFolders(dir) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
    for (const entry of fs.readdirSync(dir)) removeEmptyFolders(path.join(dir, entry));
    try {
        fs.rmdirSync(dir);
    } catch {
        // not empty, or removed by another copy meanwhile
    }
}

// Copies source over target; returns how many files were written, left as
// they were and removed
function copyPublic(source, target) {
    if (!fs.existsSync(source)) throw new Error(`No such folder: ${source}`);
    const files = filesUnder(source);
    const result = { written: 0, unchanged: 0, removed: 0 };

    for (const file of files) {
        const bytes = fs.readFileSync(path.join(source, file));
        const destination = path.join(target, file);
        if (sameContent(destination, bytes)) {
            result.unchanged++;
        } else {
            writeAtomically(destination, bytes);
            result.written++;
        }
    }

    // The game's public/kit/ is the kit's, the rest of public/ the game's: only
    // there is a file the kit no longer has removed. (Another copy's file on
    // its way into place is left alone.)
    const shipped = new Set(files);
    for (const file of filesUnder(path.join(target, OWNED_FOLDER)).map(name => path.join(OWNED_FOLDER, name))) {
        if (shipped.has(file) || file.endsWith('.tmp')) continue;
        try {
            fs.unlinkSync(path.join(target, file));
            result.removed++;
        } catch {
            // removed by another copy meanwhile
        }
    }
    removeEmptyFolders(path.join(target, OWNED_FOLDER));
    return result;
}

module.exports = { copyPublic, KIT_PUBLIC };

if (require.main === module) {
    const target = process.argv[2];
    if (!target) {
        console.error('Usage: room-kit-copy-public <the game\'s public folder>');
        process.exit(1);
    }
    const { written, unchanged, removed } = copyPublic(KIT_PUBLIC, path.resolve(target));
    console.log(`room-kit: ${written} files copied to ${target}, ${unchanged} unchanged, ${removed} removed`);
}
