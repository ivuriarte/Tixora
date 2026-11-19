#!/usr/bin/env bash
# Installs Playwright browsers for CI jobs.
# Usage: bash scripts/ci/install-playwright.sh <chromium|firefox|webkit>...
# Run it from the directory where `npx playwright` resolves (apps/web, or the repo root after `npm ci --workspaces`).
#
# `playwright install --with-deps` does two unrelated things, and only one of them should be able to fail a gate:
#   1. The browser binaries come from Playwright's own download host. Required, so a failure here fails the job.
#   2. The OS libraries and fonts come from Ubuntu's apt mirrors (`install-deps`). GitHub's runner image already
#      carries the libraries Chromium needs, and those mirrors have gone down before: on 2026-11-19 the UAT admin
#      regression gate failed twice, after about four minutes of apt retries, with 503s and timeouts, before a
#      single test ran. So this part is best effort and time-boxed.
# Because step 2 is no longer fatal, each browser is launched once at the end. A library that is really missing
# fails there, in the install step, with Playwright's own "missing dependencies" message, instead of halfway
# through a suite.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <chromium|firefox|webkit>..." >&2
  exit 2
fi

DEPS_TIMEOUT_SECONDS="${PLAYWRIGHT_DEPS_TIMEOUT_SECONDS:-150}"

npx playwright install "$@"

deps_status=0
timeout --kill-after=15 "$DEPS_TIMEOUT_SECONDS" npx playwright install-deps "$@" || deps_status=$?

if [ "$deps_status" -ne 0 ]; then
  case "$deps_status" in
    124|137) reason="timed out after ${DEPS_TIMEOUT_SECONDS}s (exit $deps_status)" ;;
    *)       reason="exit code $deps_status" ;;
  esac
  message="apt could not install OS packages for: $* ($reason). Continuing with the libraries already on the runner; the launch check below fails this step if one is really missing."
  echo "::warning title=Playwright system dependencies::$message"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "Playwright install-deps skipped: $message" >> "$GITHUB_STEP_SUMMARY"
  fi
fi

node -e '
const pw = require("@playwright/test");
(async () => {
  for (const name of process.argv.slice(1)) {
    const browser = await pw[name].launch();
    console.log(`${name} ${browser.version()} launches`);
    await browser.close();
  }
})().catch((error) => {
  console.error(`Browser launch check failed: ${error.message}`);
  process.exit(1);
});
' "$@"
