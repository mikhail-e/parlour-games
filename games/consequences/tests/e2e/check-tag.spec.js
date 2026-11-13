// The tests' requests to a live site carry the tag " EscapistCheck" at the end
// of their user agent: the kit's test (packages/room-kit/e2e-check-tag.js), on
// this game's config, so it checks what `npm run test:e2e:prod` sends
require('@parlour-games/room-kit/e2e-check-tag').checkTagTest();
