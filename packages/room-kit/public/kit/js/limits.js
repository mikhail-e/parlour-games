// The limits of what a player types in, as the server keeps them (the kit's
// shared/players.js): a page checks them before it sends, so a player never
// types what the server would cut or refuse. A browser script cannot
// require() the server's file, so the values are copies; the kit's
// tests/limits.test.js fails if the two ever drift apart. Keep each value on
// a single line for that test.
/* exported MAX_NAME_LENGTH, isCustomAvatar */

// A name, counted as a person counts characters (an emoji is one)
const MAX_NAME_LENGTH = 128;

// A custom avatar is a small photo the player uploaded, carried as a base64
// data URL in the same field the emoji uses
const MAX_CUSTOM_AVATAR_LENGTH = 32768;
const CUSTOM_AVATAR_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

// True if the value is a strictly valid custom-avatar data URL: only the three
// safe raster image MIME types, only base64 characters, and small enough.
// Only such a value is ever shown as an image
function isCustomAvatar(value) {
    return typeof value === 'string'
        && value.length <= MAX_CUSTOM_AVATAR_LENGTH
        && CUSTOM_AVATAR_PATTERN.test(value);
}
