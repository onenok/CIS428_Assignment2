/**
 * Test-only access to engine internals.
 *
 * Engine 19 marked `createPhysicsEngine()` as `@internal` and removed it from the
 * package's public barrel, so `import { createPhysicsEngine } from
 * '@gnsx/genesys.js'` no longer type-checks. The package `exports` map only
 * publishes `.`, `./node`, `./avatar-pack-tools`, `./browser-runtime` and
 * `./eslint-config`, which rules out a `@gnsx/genesys.js/dist/...` specifier.
 *
 * A *relative* path is the one route that keeps working: `exports` only gates
 * package-name specifiers, so both `tsc` (with `preserveSymlinks`) and Node/tsx
 * resolve this straight into the installed package.
 *
 * This is deliberately confined to one file. Engine-layer tests already reach
 * past the public API by injecting a `BaseGameLoop` stub into `World`, so the
 * coupling is pre-existing; centralising it means a future engine move only has
 * to be fixed here.
 */

export { createPhysicsEngine } from '../../node_modules/@gnsx/genesys.js/dist/src/physics/createPhysicsEngine.js';