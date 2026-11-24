import { z } from "zod/mini";

// `zod/mini` holds the same checks as classic Zod as functions a bundler can drop when unused.
// Use the interpreter in the page and Workers: the optional JIT probe itself violates our strict
// script policy even when Zod catches the resulting error. Classic Zod also installs its English
// messages and the memoizer that lets a parse meet a reference cycle; `zod/mini` does neither on
// its own, so both are installed here to keep every parse and every message as they were.
z.config({ jitless: true, ...z.locales.en(), memoizer: z.memoizer() });

export { z };
