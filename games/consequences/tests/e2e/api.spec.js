// The HTTP API, without a page: the requests the pages make
const { test, expect } = require('./helpers');
const pkg = require('../../package.json');

test('the version is the game\'s, from its package.json', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'an answer of the server: the device adds nothing');
    const response = await request.get('/api/version');
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ version: pkg.version });
});
