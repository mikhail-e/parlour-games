// The shared part of the ESLint config of the kit and of every game on it: the
// rules, and one block per environment. The paths are the same in the kit and
// in a game (worker/, public/js/, tests/...), so one block fits both.
//
// A game's public/kit/ is a copy of the kit's public/kit/ (scripts/copy-public.js)
// and is never checked there; in the kit the same folder holds the sources, and
// only the third-party code in it is skipped. Hence `ignores`: each config says
// what it skips.
import js from "@eslint/js";
import globals from "globals";

// Rules on top of eslint:recommended, shared by every block
export const sharedRules = {
    "eqeqeq": ["error", "smart"],
    "no-unused-vars": ["error", { args: "after-used", argsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }],
    "no-self-compare": "error",
    "no-template-curly-in-string": "error",
    "no-unmodified-loop-condition": "error",
    "no-constructor-return": "error",
    "no-promise-executor-return": "error",
    "array-callback-return": "error",
};

export default function roomKitEslint({ ignores = [] } = {}) {
    return [
        { ignores },

        js.configs.recommended,

        // The Worker and its rooms (Cloudflare Workers, ES modules): the names of a
        // service worker's scope, and the Workers' own WebSocket classes
        {
            files: ["worker/**/*.js"],
            languageOptions: {
                sourceType: "module",
                globals: {
                    ...globals.serviceworker,
                    WebSocketPair: "readonly",
                    WebSocketRequestResponsePair: "readonly",
                },
            },
            rules: sharedRules,
        },

        // Code for both Node (Jest) and the Worker (bundled by wrangler): CommonJS
        {
            files: ["shared/**/*.js"],
            languageOptions: {
                sourceType: "commonjs",
                globals: {
                    ...globals.node,
                },
            },
            rules: sharedRules,
        },

        // Browser pages: classic <script> files, no modules and no build step
        {
            files: ["public/js/**/*.js", "public/kit/js/**/*.js"],
            ignores: ["public/kit/js/service-worker.js"],
            languageOptions: {
                sourceType: "script",
                globals: {
                    ...globals.browser,
                    bootstrap: "readonly",
                },
            },
            rules: {
                ...sharedRules,
                // Debug output goes through debugLog() (the kit's app.js): players' consoles stay quiet
                "no-console": ["error", { allow: ["warn", "error"] }],
            },
        },

        // Service worker — its own global scope: a game's sw.js and the kit's
        // logic it loads
        {
            files: ["public/sw.js", "public/kit/js/service-worker.js"],
            languageOptions: {
                sourceType: "script",
                globals: {
                    ...globals.serviceworker,
                },
            },
            rules: sharedRules,
        },

        // Tests (Jest, CommonJS)
        {
            files: ["tests/*.js"],
            languageOptions: {
                sourceType: "commonjs",
                globals: {
                    ...globals.node,
                    ...globals.jest,
                },
            },
            rules: sharedRules,
        },

        // Browser tests, their configs and the developer's scripts (Node, CommonJS):
        // callbacks passed to page.evaluate() run in the page, where browser names exist
        {
            files: ["tests/e2e/**/*.js", "playwright.config.js", "playwright.js", "e2e.js", "e2e-helpers.js", "checks.js", "scripts/*.js"],
            languageOptions: {
                sourceType: "commonjs",
                globals: {
                    ...globals.node,
                    ...globals.browser,
                },
            },
            rules: sharedRules,
        },

        // The ESLint configs themselves
        {
            files: ["eslint.config.mjs", "eslint.mjs"],
            languageOptions: {
                globals: {
                    ...globals.node,
                },
            },
        },

        {
            ignores: [
                "node_modules/",
                "coverage/",
                "test-results/",
                "playwright-report/",
                ".wrangler/",
            ],
        },
    ];
}
