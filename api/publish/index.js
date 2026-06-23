// Test-compat shim — real implementation is in lib/core/handlers/publish.js.
// Re-exports default handler + named export so api/publish/index.test.js can
// keep importing from here. Vercelignored so it does not count as a function.
export { default, buildWpPayload } from '../../lib/core/handlers/publish.js';
