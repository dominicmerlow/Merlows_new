// Test-compat shim — real implementation is in lib/content/handlers/item.js.
// Re-exports default handler + named export so api/content/[id].test.js can
// keep importing from here. Vercelignored so it does not count as a function.
export { default, applyStatusTransition } from '../../lib/content/handlers/item.js';
