/**
 * Self-update through the official plugin manager.
 *
 * The manager can only replace registry bundles through `updateBundle`; a
 * `github:` dependency is replaced by removing the package and installing the
 * same spec again. That operation disposes this very plugin half-way, so it is
 * scheduled rather than awaited: the HTTP answer leaves first, then the plugin
 * disappears and comes back on the new commit.
 *
 * Safety rails: the spec is fixed in code (no caller-supplied target), and the
 * update runs only when the startup check reports a newer commit.
 */

import { checkForUpdate, getUpdateState } from './update-check.js';

/** The one package this plugin may ever (re)install. */
export const SELF_SPEC = 'github:mikhailnarzik-source/dsh-github-safe';
export const SELF_NAME = 'dsh-github-safe';

/** Marks a scheduled update so a second click does not race the first. */
let scheduled = false;

/**
 * Ask the manager to reinstall this plugin from GitHub.
 * @param ctx - plugin context exposing `pluginManager` and `credentials`.
 * @param resolveToken - token provider for the update check.
 * @returns `{ started, reason }`; the manager work continues after the answer.
 */
export function startUpdate(ctx, resolveToken) {
  const manager = ctx.get('pluginManager');
  if (manager === undefined) {
    return { started: false, reason: 'менеджер плагинов недоступен в этой сборке' };
  }
  if (scheduled) {
    return { started: false, reason: 'обновление уже запущено' };
  }
  if (getUpdateState().status !== 'behind') {
    return { started: false, reason: 'обновление не требуется' };
  }

  scheduled = true;
  // Let the response reach the browser before this plugin is disposed.
  setTimeout(() => {
    void (async () => {
      try {
        await manager.removeBundle(SELF_NAME);
        await manager.installBundle(SELF_SPEC, { enabled: true });
      } catch (error) {
        // The plugin may already be gone; nothing safe is left to report to.
        console.error('[github-safe] self-update failed:', error?.message ?? error);
      }
    })();
  }, 150);

  return { started: true, reason: 'обновление запущено' };
}

/**
 * Refresh the update state before answering a click.
 * @param resolveToken - token provider for the update check.
 * @returns the fresh state.
 */
export async function refreshBeforeUpdate(resolveToken) {
  return checkForUpdate(resolveToken);
}
