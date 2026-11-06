// ESLint of the kit itself, on the shared part every game uses (eslint.mjs).
// Here public/kit/ holds the sources; only the third-party code in it is skipped
import roomKitEslint from "./eslint.mjs";

export default roomKitEslint({ ignores: ["public/kit/vendor/"] });
