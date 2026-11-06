/**
 * Self-check: is this installed copy the same commit as `main` on GitHub?
 *
 * Runs once when the plugin loads. It reads exactly one file — the profile's
 * `pnpm-lock.yaml`, which records the commit pnpm resolved for this package —
 * and asks GitHub for the head of `main`. Nothing is downloaded, replaced or
 * written; the answer is published to the prompt and to `github_status`.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository this plugin is published from. */
const OWNER = 'mikhailnarzik-source';
const REPO = 'dsh-github-safe';
const BRANCH = 'main';

/** The lockfile is small; anything larger is not ours to read. */
const MAX_LOCK_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 8_000;

/** Result of the last check. */
let state = {
  status: 'unknown',
  installed: null,
  latest: null,
  message: '',
  date: '',
  detail: '',
};

/** Short commit form for messages. */
function short(sha) {
  return sha === null || sha === undefined ? '?' : String(sha).slice(0, 7);
}

/** The current check result. */
export function getUpdateState() {
  return state;
}

/** One-line state for the prompt variable. */
export function formatUpdateState() {
  if (state.status === 'current') return `up to date (${short(state.installed)})`;
  if (state.status === 'behind') {
    const note = state.message.length > 0 ? ` — ${state.message}` : '';
    return `update available: installed ${short(state.installed)}, latest ${short(state.latest)}${note}`;
  }
  if (state.status === 'error') return `check failed (${state.detail})`;
  return 'not checked yet';
}

/** Longer text for `github_status`, including the update command. */
export function describeUpdate() {
  if (state.status === 'behind') {
    return [
      `Обновление плагина: доступно — установлен ${short(state.installed)}, в ${BRANCH} ${short(state.latest)} (${state.date}) ${state.message}`,
      `Обновить: dsh plugin --profile desktop add github:${OWNER}/${REPO}`,
      'После установки нужен перезапуск DSH. Плагин никогда не обновляет себя сам.',
    ].join('\n');
  }
  if (state.status === 'current') return `Обновление плагина: актуально (${short(state.installed)}).`;
  if (state.status === 'error') return `Обновление плагина: проверка не удалась (${state.detail}).`;
  return 'Обновление плагина: ещё не проверялось.';
}

/**
 * Locate the profile lockfile next to this package.
 * @returns absolute path, or undefined when the layout is not a pnpm profile.
 */
function lockfilePath() {
  try {
    // <profile>/node_modules/dsh-github-safe/lib/update-check.js
    const here = fileURLToPath(import.meta.url);
    const packageDir = path.dirname(path.dirname(here));
    const profileDir = path.dirname(path.dirname(packageDir));
    const candidate = path.join(profileDir, 'pnpm-lock.yaml');
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    // fall through to the home-relative guess
  }
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
  const fallback = path.join(home, 'profiles', 'desktop', 'pnpm-lock.yaml');
  return fs.existsSync(fallback) ? fallback : undefined;
}

/**
 * Read the commit pnpm resolved for this package.
 * @returns 40-character sha, or null when the entry is absent (link install).
 */
function readInstalledCommit() {
  const lock = lockfilePath();
  if (lock === undefined) return null;
  const stat = fs.statSync(lock);
  if (!stat.isFile() || stat.size > MAX_LOCK_BYTES) return null;
  const text = fs.readFileSync(lock, 'utf8');
  const pattern = new RegExp(
    `dsh-github-safe:[\\s\\S]{0,240}?codeload\\.github\\.com/${OWNER}/${REPO}/tar\\.gz/([0-9a-f]{40})`,
  );
  const match = pattern.exec(text);
  return match === null ? null : match[1];
}

/**
 * Compare the installed commit with `main`.
 * @param resolveToken - optional async provider of a GitHub token.
 * @returns the new state.
 */
export async function checkForUpdate(resolveToken) {
  try {
    const installed = readInstalledCommit();
    if (installed === null) {
      state = { ...state, status: 'unknown', detail: 'коммит не найден в lockfile (установка через link:)' };
      return state;
    }

    const headers = {
      accept: 'application/vnd.github+json',
      'user-agent': 'dsh-github-safe/update-check',
    };
    const token = typeof resolveToken === 'function' ? await resolveToken() : undefined;
    if (typeof token === 'string' && token.length > 0) headers.authorization = `Bearer ${token}`;

    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/commits/${BRANCH}`, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      state = { ...state, status: 'error', installed, detail: `HTTP ${response.status}` };
      return state;
    }

    const data = await response.json();
    const latest = data.sha;
    const message = String(data.commit?.message ?? '').split('\n')[0].slice(0, 120);
    const date = String(data.commit?.committer?.date ?? '');
    state = latest === installed
      ? { status: 'current', installed, latest, message, date, detail: '' }
      : { status: 'behind', installed, latest, message, date, detail: '' };
    return state;
  } catch (error) {
    state = { ...state, status: 'error', detail: String(error?.message ?? error).slice(0, 160) };
    return state;
  }
}
