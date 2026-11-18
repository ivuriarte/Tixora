#!/usr/bin/env node
// Production-dependency audit gate: same bar as `npm audit --omit=dev --audit-level=high`,
// except an advisory listed in .github/audit-exceptions.json passes until its expiry date.
//
// Why this exists: npm has no per-advisory allowlist, and a published advisory with no patched
// version (picomatch GHSA-fc5q-39xc-vjpf, Nov 2026) turns the whole gate red for every commit.
// An exception is narrow (one advisory id), written down (reason, approver, date) and expires,
// so it cannot quietly become permanent. Anything else at high or critical still fails the build.
//
// Fails closed: if npm audit cannot answer (offline, registry error, unreadable JSON) the gate fails.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BLOCKING = new Set(['high', 'critical']);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const exceptionsPath = resolve(repoRoot, '.github', 'audit-exceptions.json');

function fail(message) {
  console.error(`::error::${message}`);
  console.error(message);
  process.exit(1);
}

function loadExceptions() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(exceptionsPath, 'utf8'));
  } catch (err) {
    fail(`Cannot read ${exceptionsPath}: ${err.message}`);
  }
  if (!Array.isArray(raw)) fail(`${exceptionsPath} must be a JSON array`);
  for (const entry of raw) {
    const ok =
      entry &&
      /^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/.test(entry.advisory ?? '') &&
      typeof entry.reason === 'string' && entry.reason.length > 20 &&
      typeof entry.approvedBy === 'string' && entry.approvedBy.length > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(entry.expires ?? '');
    if (!ok) fail(`Invalid audit exception entry: ${JSON.stringify(entry)}`);
  }
  return raw;
}

function runAudit() {
  const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  // npm audit exits 1 when it finds vulnerabilities, so the exit code alone says nothing.
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    fail(`npm audit did not return JSON (exit ${result.status}). ${result.stderr?.slice(0, 500) ?? ''}`);
  }
  if (report.error || !report.vulnerabilities) {
    fail(`npm audit failed to produce a report: ${JSON.stringify(report.error ?? report).slice(0, 500)}`);
  }
  return report;
}

// Every vulnerability's root cause is an advisory object somewhere in a `via` list; string
// entries only point at other packages. Collecting the objects gives each advisory exactly once.
function collectAdvisories(report) {
  const found = new Map();
  for (const [pkg, vuln] of Object.entries(report.vulnerabilities)) {
    for (const via of vuln.via ?? []) {
      if (typeof via === 'string') continue;
      const id = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/.exec(via.url ?? '')?.[0] ?? `npm-advisory-${via.source}`;
      found.set(id, { id, severity: via.severity, title: via.title, range: via.range, package: via.name ?? pkg });
    }
  }
  return [...found.values()];
}

const today = new Date().toISOString().slice(0, 10);
const exceptions = loadExceptions();
const byId = new Map(exceptions.map((e) => [e.advisory, e]));
const blocking = collectAdvisories(runAudit()).filter((a) => BLOCKING.has(a.severity));

const failures = [];
const allowed = [];
for (const adv of blocking) {
  const exception = byId.get(adv.id);
  if (!exception) failures.push(`${adv.id} (${adv.severity}) ${adv.package} ${adv.range}: ${adv.title} — no exception on file`);
  else if (exception.expires < today) failures.push(`${adv.id} (${adv.severity}) ${adv.package}: exception expired on ${exception.expires} — re-check for a patched version, then renew or remove it`);
  else allowed.push(`${adv.id} ${adv.package} — accepted until ${exception.expires} (${exception.approvedBy}, ${exception.approvedOn ?? 'undated'})`);
}

const stillPresent = new Set(blocking.map((a) => a.id));
for (const e of exceptions) {
  if (!stillPresent.has(e.advisory)) console.log(`Note: exception ${e.advisory} no longer matches any high/critical advisory — remove it from .github/audit-exceptions.json.`);
}

for (const line of allowed) console.log(`Accepted exception: ${line}`);
if (failures.length > 0) {
  for (const line of failures) console.error(`::error::${line}`);
  fail(`Production dependency audit failed: ${failures.length} high/critical advisor${failures.length === 1 ? 'y' : 'ies'} without a valid exception.`);
}
console.log(`Production dependency audit passed: ${blocking.length} high/critical advisor${blocking.length === 1 ? 'y' : 'ies'}, all covered by a current exception.`);
