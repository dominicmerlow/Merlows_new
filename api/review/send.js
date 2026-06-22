// api/review/send.js
// Test-compat shim — real implementation is in lib/review/handlers/send.js.
// Re-exports the token helpers for test compatibility (send.test.js imports
// buildApprovalToken / parseApprovalToken from here). .vercelignore'd so Vercel
// does not count it as a separate function.
export { buildApprovalToken, parseApprovalToken } from '../../lib/review/handlers/send.js';
