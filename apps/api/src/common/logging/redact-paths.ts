/**
 * Request and response fields that must never reach the logs. Bracket notation is used
 * for hyphenated header names so they are unambiguous to the redaction engine.
 *
 * `x-registration-token` is a live guest bearer token for a seat hold; it was missing
 * from this list, so every guest request used to write it to the logs.
 */
export const LOG_REDACT_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-cron-secret"]',
  'req.headers["x-registration-token"]',
  'res.headers["set-cookie"]',
];
