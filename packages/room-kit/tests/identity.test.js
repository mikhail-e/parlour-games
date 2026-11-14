// Room codes (shared/identity.js): the code is all that lets a stranger into
// a room, so it comes from the cryptographic generator, and a code that is
// not one never reaches a room (the Worker checks it first)
const { generateRoomCode, isValidRoomCode } = require('../shared/identity');

test('a room code is six capital letters and digits, a new one each time', () => {
    const codes = Array.from({ length: 100 }, generateRoomCode);
    for (const code of codes) {
        expect(code).toMatch(/^[A-Z0-9]{6}$/);
        expect(isValidRoomCode(code)).toBe(true);
    }
    expect(new Set(codes).size).toBeGreaterThan(95);
});

test('a room code is checked as it is: six capitals and digits, nothing else', () => {
    for (const code of ['ABC123', '000000', 'ZZZZZZ']) {
        expect(isValidRoomCode(code)).toBe(true);
    }
    for (const notACode of ['', 'ABC12', 'ABC1234', 'abc123', 'ABC12!', null, undefined, 123456]) {
        expect(isValidRoomCode(notACode)).toBe(false);
    }
});
