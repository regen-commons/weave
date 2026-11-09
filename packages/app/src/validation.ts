import { z } from "zod";

// Use the interpreter in the page and Workers. The optional JIT probe itself
// violates our strict script policy even when Zod catches the resulting error.
z.config({ jitless: true });

export { z };
