/**
 * Deny-by-default policy for the GitHub plugin.
 *
 * The plugin never accepts a raw URL or a raw REST path from the model: every
 * tool builds its request from validated typed arguments, and the constructed
 * `METHOD /path` pair is checked here before any network call. Anything not
 * matched by ALLOW is refused with a reason, so an endpoint that is not
 * explicitly listed (account, profile, organisation, access, billing, app
 * installation, repository deletion) can never be reached — even by a bug in a
 * tool handler.
 *
 * Design rules:
 *  - GET is the only method with a broad repository surface (reads are safe).
 *  - POST/PATCH/PUT exist only for repository content: issues, pull requests,
 *    reviews, releases, file commits.
 *  - DELETE is never allowed, so repositories, branches, tags, releases,
 *    files and webhooks cannot be removed.
 *  - Nothing under /user, /users, /orgs, /apps, /installations, /marketplace
 *    is reachable, so the token's owner, profile, e-mail, keys, memberships and
 *    grants stay untouched.
 */

/** Top-level areas the plugin refuses outright, with the reason shown to the model. */
const FORBIDDEN_AREAS = [
  [/^\/user(\/|$)/, 'профиль владельца токена (аккаунт, e-mail, ключи, настройки) не доступен плагину'],
  [/^\/users(\/|$)/, 'профили пользователей не доступны плагину'],
  [/^\/orgs(\/|$)/, 'организации, участники и приглашения не доступны плагину'],
  [/^\/teams(\/|$)/, 'команды не доступны плагину'],
  [/^\/apps?(\/|$)/, 'GitHub Apps и установки не доступны плагину'],
  [/^\/installations?(\/|$)/, 'установки приложений не доступны плагину'],
  [/^\/marketplace_listing(\/|$)/, 'маркетплейс не доступен плагину'],
  [/^\/admin(\/|$)/, 'админ-API не доступен плагину'],
  [/^\/graphql(\/|$)/, 'GraphQL не используется: только REST-эндпоинты из allowlist'],
];

/**
 * Repository sub-resources that change access or repository identity rather
 * than repository content. They are blocked even though they live under
 * /repos/{owner}/{repo}.
 */
const FORBIDDEN_REPO_RESOURCES = [
  [/^\/repos\/[^/]+\/[^/]+\/collaborators(\/|$)/, 'управление доступом к репозиторию (collaborators) запрещено'],
  [/^\/repos\/[^/]+\/[^/]+\/invitations(\/|$)/, 'приглашения в репозиторий запрещены'],
  [/^\/repos\/[^/]+\/[^/]+\/hooks(\/|$)/, 'вебхуки репозитория запрещены'],
  [/^\/repos\/[^/]+\/[^/]+\/keys(\/|$)/, 'deploy-ключи репозитория запрещены'],
  [/^\/repos\/[^/]+\/[^/]+\/actions\/secrets(\/|$)/, 'секреты Actions запрещены'],
  [/^\/repos\/[^/]+\/[^/]+\/actions\/variables(\/|$)/, 'переменные Actions запрещены'],
  [/^\/repos\/[^/]+\/[^/]+\/transfer(\/|$)/, 'передача репозитория запрещена'],
  [/^\/repos\/[^/]+\/[^/]+\/subscription(\/|$)/, 'подписка и биллинг репозитория запрещены'],
  [/^\/repos\/[^/]+\/[^/]+\/pages(\/|$)/, 'настройки Pages запрещены'],
];

/** Repository shape used by every rule. Ownership and name are validated by the tools. */
const R = '/repos/[^/]+/[^/]+';

/** @type {{ method: string, rule: RegExp, note: string }[]} */
const ALLOW = [
  // --- reads -------------------------------------------------------------
  { method: 'GET', rule: /^\/rate_limit$/, note: 'лимиты токена' },
  { method: 'GET', rule: new RegExp(`^${R}$`), note: 'метаданные репозитория' },
  { method: 'GET', rule: new RegExp(`^${R}/branches(/[^/]+)?$`), note: 'ветки' },
  { method: 'GET', rule: new RegExp(`^${R}/commits(/[^/]+)?$`), note: 'коммиты' },
  { method: 'GET', rule: new RegExp(`^${R}/contents(/.*)?$`), note: 'файлы и каталоги' },
  { method: 'GET', rule: new RegExp(`^${R}/git/(refs|trees|blobs|commits|tags)/.*$`), note: 'git-объекты' },
  { method: 'GET', rule: new RegExp(`^${R}/git/ref/heads/[^/]+$`), note: 'ссылка на ветку' },
  { method: 'GET', rule: new RegExp(`^${R}/issues(/[^/]+)?(/comments|/events)?$`), note: 'issue' },
  { method: 'GET', rule: new RegExp(`^${R}/issues/comments/[^/]+$`), note: 'комментарий issue' },
  { method: 'GET', rule: new RegExp(`^${R}/pulls(/[^/]+)?(/files|/commits|/comments|/reviews|/merge)?$`), note: 'pull request' },
  { method: 'GET', rule: new RegExp(`^${R}/pulls/[^/]+/comments/[^/]+$`), note: 'review-комментарий' },
  { method: 'GET', rule: new RegExp(`^${R}/commits/[^/]+/(check-runs|status)$`), note: 'статусы проверок' },
  { method: 'GET', rule: new RegExp(`^${R}/check-runs/[^/]+$`), note: 'проверка' },
  { method: 'GET', rule: new RegExp(`^${R}/releases(/.*)?$`), note: 'релизы' },
  { method: 'GET', rule: new RegExp(`^${R}/tags$`), note: 'теги' },
  { method: 'GET', rule: new RegExp(`^${R}/labels$`), note: 'метки' },
  { method: 'GET', rule: new RegExp(`^${R}/languages$`), note: 'языки' },
  { method: 'GET', rule: new RegExp(`^${R}/actions/runs(/[^/]+)?(/jobs)?$`), note: 'запуски Actions' },
  { method: 'GET', rule: new RegExp(`^${R}/actions/workflows(/[^/]+)?$`), note: 'workflow' },
  { method: 'GET', rule: /^\/search\/(repositories|issues|code|commits)$/, note: 'поиск' },

  // --- repository content writes ----------------------------------------
  { method: 'POST', rule: new RegExp(`^${R}/issues$`), note: 'создать issue' },
  { method: 'POST', rule: new RegExp(`^${R}/issues/[^/]+/comments$`), note: 'комментарий к issue' },
  { method: 'POST', rule: new RegExp(`^${R}/pulls$`), note: 'создать pull request' },
  { method: 'POST', rule: new RegExp(`^${R}/pulls/[^/]+/reviews$`), note: 'ревью pull request' },
  { method: 'POST', rule: new RegExp(`^${R}/pulls/[^/]+/comments$`), note: 'review-комментарий' },
  { method: 'POST', rule: new RegExp(`^${R}/releases$`), note: 'создать релиз' },
  { method: 'PATCH', rule: new RegExp(`^${R}/issues/[^/]+$`), note: 'изменить issue (закрыть, переоткрыть, метки)' },
  { method: 'PATCH', rule: new RegExp(`^${R}/pulls/[^/]+$`), note: 'изменить pull request' },
  { method: 'PATCH', rule: new RegExp(`^${R}/releases/[^/]+$`), note: 'изменить релиз' },
  { method: 'PUT', rule: new RegExp(`^${R}/pulls/[^/]+/merge$`), note: 'смёржить pull request' },
  { method: 'PUT', rule: new RegExp(`^${R}/contents/.+$`), note: 'закоммитить файл' },
  { method: 'POST', rule: new RegExp(`^${R}/git/(blobs|trees|commits)$`), note: 'git-объекты для пакетного коммита' },
  { method: 'POST', rule: new RegExp(`^${R}/git/refs$`), note: 'создать ветку' },
  { method: 'PATCH', rule: new RegExp(`^${R}/git/refs/heads/[^/]+$`), note: 'сдвинуть ветку на новый коммит' },
];

/** Methods the plugin may ever send. */
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT']);

/** Characters a constructed path may contain (already percent-encoded segments). */
const SAFE_PATH = /^[A-Za-z0-9\-._~!$&'()*+,;=:@%/]+$/;

/**
 * Validate one path segment before it is encoded into a request path.
 * @param value - raw segment from tool arguments.
 * @param label - name used in the error message.
 * @returns the segment unchanged.
 * @throws TypeError when the segment could change the path structure.
 */
export function assertSegment(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label}: ожидается непустая строка`);
  }
  if (value.length > 200) {
    throw new TypeError(`${label}: слишком длинное значение`);
  }
  if (value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new TypeError(`${label}: недопустимое значение "${value}"`);
  }
  // Control characters would let a value break out of the header/path context.
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError(`${label}: содержит управляющие символы`);
  }
  return value;
}

/**
 * Validate an owner or repository name.
 * @param value - owner or repository.
 * @param label - name used in the error message.
 * @returns the validated value.
 */
export function assertName(value, label) {
  assertSegment(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new TypeError(`${label}: ожидается имя из букв, цифр, "-", "_" и "."`);
  }
  return value;
}

/**
 * Check a constructed request against the allowlist.
 * @param method - HTTP method the plugin is about to use.
 * @param path - request path, already percent-encoded, starting with "/".
 * @returns `{ ok: true, note }` when allowed, `{ ok: false, reason }` otherwise.
 */
export function check(method, path) {
  if (typeof method !== 'string' || !ALLOWED_METHODS.has(method)) {
    return { ok: false, reason: `метод ${String(method)} запрещён: плагин не удаляет и не переносит ничего через DELETE` };
  }
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 4000) {
    return { ok: false, reason: 'некорректный путь запроса' };
  }
  if (!SAFE_PATH.test(path) || path.includes('//') || path.includes('..')) {
    return { ok: false, reason: 'путь содержит недопустимые символы или переходы ".."' };
  }

  // The single deliberate exception inside /user: creating a new repository in
  // the token owner's account. It creates a resource and reads nothing about
  // the account; every other /user path (profile, e-mails, keys, settings,
  // deletions) stays unreachable below.
  if (method === 'POST' && path === '/user/repos') {
    return { ok: true, note: 'создать новый репозиторий в своём аккаунте' };
  }

  for (const [pattern, reason] of FORBIDDEN_AREAS) {
    if (pattern.test(path)) return { ok: false, reason };
  }
  for (const [pattern, reason] of FORBIDDEN_REPO_RESOURCES) {
    if (pattern.test(path)) return { ok: false, reason };
  }

  for (const entry of ALLOW) {
    if (entry.method === method && entry.rule.test(path)) {
      return { ok: true, note: entry.note };
    }
  }

  const known = ALLOW.filter((entry) => entry.rule.test(path)).map((entry) => entry.method);
  const hint = known.length > 0
    ? `этот путь доступен только для ${known.join('/')}`
    : 'эндпоинт отсутствует в allowlist плагина';
  return { ok: false, reason: `${method} ${path}: ${hint}` };
}

/**
 * Build a request path from validated segments.
 * @param segments - path pieces; dynamic values are encoded.
 * @returns the encoded path starting with "/".
 */
export function buildPath(...segments) {
  const encoded = segments.map((segment) => {
    if (typeof segment !== 'string') throw new TypeError('сегмент пути должен быть строкой');
    if (segment.startsWith('/')) return segment;          // literal prefix such as "/repos"
    assertSegment(segment, 'сегмент пути');
    return encodeURIComponent(segment);
  });
  const path = encoded.join('/');
  return path.startsWith('/') ? path : `/${path}`;
}

/** Human-readable summary of the allowlist, used by github_status. */
export function describePolicy() {
  const topline = ALLOW.map((entry) => `${entry.method} ${entry.note}`).join('\n');
  return [
    'Разрешено (allowlist, deny-by-default):',
    topline,
    '',
    'Отдельное исключение: POST /user/repos — создать новый репозиторий в своём аккаунте (ничего не читает и не меняет в профиле).',
    'Запрещено всегда: DELETE целиком; остальные /user, /users, /orgs, /teams, /apps, /installations, /marketplace_listing, /admin, /graphql;',
    'collaborators, invitations, hooks, deploy-ключи, secrets/variables Actions, transfer, billing, Pages.',
  ].join('\n');
}
