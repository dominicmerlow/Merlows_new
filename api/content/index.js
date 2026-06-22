// Test-compat shim — real implementation is in lib/content/handlers/index.js.
// Re-exports default handler + named exports so api/content/index.test.js can
// keep importing from here. Vercelignored so it does not count as a function.
export { default, buildContentItem, validateContentItem } from '../../lib/content/handlers/index.js';
