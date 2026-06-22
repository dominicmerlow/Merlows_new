// api/review/[token].js
// Test-compat shim — real implementation is in lib/review/handlers/token.js.
// Re-exports the default handler + named computeNewStatus so the co-located
// test ([token].test.js) keeps importing from this path. .vercelignore'd so
// Vercel does not count it as a separate function.
export { default, computeNewStatus } from '../../lib/review/handlers/token.js';
