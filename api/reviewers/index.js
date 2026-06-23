// Test-compat shim — real implementation is in lib/core/handlers/reviewers.js.
// Re-exports default handler + named exports so api/reviewers/index.test.js can
// keep importing from here. Vercelignored so it does not count as a function.
export { default, buildReviewer, validateReviewer } from '../../lib/core/handlers/reviewers.js';
