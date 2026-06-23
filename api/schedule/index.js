// Test-compat shim — real implementation is in lib/core/handlers/schedule.js.
// Re-exports default handler + named export so api/schedule/index.test.js can
// keep importing from here. Vercelignored so it does not count as a function.
export { default, validateScheduleDate } from '../../lib/core/handlers/schedule.js';
