import js from "@eslint/js";
import globals from "globals";

// Rules on top of eslint:recommended, shared by every block
const sharedRules = {
    "eqeqeq": ["error", "smart"],
    "no-unused-vars": ["error", { args: "after-used", argsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }],
    "no-self-compare": "error",
    "no-template-curly-in-string": "error",
    "no-unmodified-loop-condition": "error",
    "no-constructor-return": "error",
    "no-promise-executor-return": "error",
    "array-callback-return": "error",
};

export default [
    // Third-party code is checked by its authors, not by our rules
    { ignores: ["public/vendor/"] },

    js.configs.recommended,

    // Server (Node, CommonJS)
    {
        files: ["server.js", "game-logic.js", "game-backups.js"],
        languageOptions: {
            sourceType: "commonjs",
            globals: {
                ...globals.node,
            },
        },
        rules: sharedRules,
    },

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

    // Browser pages: classic <script> files, no modules and no build step
    {
        files: ["public/js/**/*.js"],
        languageOptions: {
            sourceType: "script",
            globals: {
                ...globals.browser,
                bootstrap: "readonly",
                io: "readonly",
            },
        },
        rules: {
            ...sharedRules,
            // Debug output goes through debugLog() (utils.js): players' consoles stay quiet
            "no-console": ["error", { allow: ["warn", "error"] }],
        },
    },

    // Service worker — its own global scope
    {
        files: ["public/sw.js"],
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

    // Browser tests and the developer's scripts (Playwright, CommonJS):
    // callbacks passed to page.evaluate() run in the page, where browser names exist
    {
        files: ["tests/e2e/**/*.js", "playwright.config.js", "scripts/*.js"],
        languageOptions: {
            sourceType: "commonjs",
            globals: {
                ...globals.node,
                ...globals.browser,
            },
        },
        rules: sharedRules,
    },

    // This file
    {
        files: ["eslint.config.mjs"],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },

    {
        ignores: [
            "node_modules/",
            "games/",
            "coverage/",
            "test-results/",
            "playwright-report/",
            ".wrangler/",
        ],
    },
];
