---
paths:
  - "packages/**/*.ts"
  - "packages/**/*.tsx"
---

# TypeScript rules

- TypeScript 6.0, strict, with `noUncheckedIndexedAccess`. Stay on 6.0 until
  `@vercel/node` can compile functions without the JavaScript compiler API that
  TypeScript 7 removed.
- Write only erasable syntax (`erasableSyntaxOnly`): no enums, namespaces or
  parameter properties. Node runs the tests by stripping types.
- Import relative modules with their extension, such as `./routes.ts`, so `node --test`
  and Vite resolve the same file.
- Keep logic that tests need in `.ts` files. `node --test` cannot load `.tsx`, so
  components stay thin and push decisions into plain modules.
- Use `unknown` for anything from outside the program, such as request bodies, model
  output and storage, and validate it before use. No `any`.
- Prefer named exports, and name things by the domain terms in AGENTS.md.
