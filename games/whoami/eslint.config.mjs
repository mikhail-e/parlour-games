import globals from "globals";
import roomKitEslint, { sharedRules } from "@parlour-games/room-kit/eslint.mjs";

// The kit's blocks (packages/room-kit/eslint.mjs), and the game's own on top
export default [
    // public/kit/ is a copy of the kit's files: the kit checks them
    ...roomKitEslint({ ignores: ["public/kit/"] }),

    // The game's rules (CommonJS: Jest runs them in Node, the Worker bundles them)
    {
        files: ["game-logic.js"],
        languageOptions: {
            sourceType: "commonjs",
            globals: {
                ...globals.node,
            },
        },
        rules: sharedRules,
    },
];
