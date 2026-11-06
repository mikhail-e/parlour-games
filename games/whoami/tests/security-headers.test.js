// The security headers are written twice, on purpose: public/_headers puts
// them on the static files (served without running the Worker), and
// worker/security-headers.json on what the Worker answers itself (the API,
// room pages, redirects). tests/e2e/site-headers.spec.js checks what a browser
// gets; this keeps the two copies equal
const fs = require('fs');
const path = require('path');

test('the static files and the Worker send the same security headers', () => {
    const lines = fs.readFileSync(path.join(__dirname, '..', 'public', '_headers'), 'utf8').split('\n');
    const start = lines.indexOf('/*');
    const block = {};
    for (const line of lines.slice(start + 1)) {
        if (!/^\s+\S/.test(line)) break;
        const [name, ...value] = line.trim().split(': ');
        block[name] = value.join(': ');
    }

    expect(start).toBeGreaterThanOrEqual(0);
    expect(block).toEqual(require('../worker/security-headers.json'));
});
