/**
 * Minimal GitHub REST client for the plugin.
 *
 * Deliberate constraints, all of them security properties rather than
 * conveniences:
 *  - one fixed origin (`https://api.github.com`): no configurable host, so a
 *    token can never be pointed at an attacker-controlled server;
 *  - redirects are refused instead of followed, so a 30x cannot move the
 *    request (and the Authorization header) to another host;
 *  - the token is resolved from the DSH credential store on every operation
 *    and never cached, logged, rendered, or included in an error message;
 *  - every response is size-capped and time-limited.
 */

import { check } from './policy.js';

const ORIGIN = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 512 * 1024;

/**
 * Error carrying a user-facing message that is safe to show (no token, no URL
 * with credentials).
 */
export class GithubError extends Error {
  /**
   * @param message - safe message for the model.
   * @param status - HTTP status when the failure came from a response.
   * @param code - machine-readable short code.
   */
  constructor(message, status, code) {
    super(message);
    this.name = 'GithubError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Remove anything that looks like a token from a diagnostic string.
 * @param text - raw diagnostic.
 * @param token - the token in use, when known.
 * @returns the redacted text.
 */
export function redact(text, token) {
  let out = String(text ?? '');
  if (token) out = out.split(token).join('[redacted]');
  return out.replace(/gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}/g, '[redacted]');
}

/**
 * Build the client bound to one plugin context.
 * @param ctx - plugin context exposing `credentials` and `get('tools')`.
 * @returns an object with `request` and `status`.
 */
export function createClient(ctx) {
  /** Resolve the token for one operation; never cached across operations. */
  const resolveToken = async () => {
    const credentials = ctx.get('credentials');
    if (credentials === undefined) {
      throw new GithubError('Сервис учётных данных DSH недоступен.', undefined, 'no-credentials');
    }
    const hit = await credentials.resolve('GITHUB_TOKEN');
    if (hit === undefined || typeof hit.value !== 'string' || hit.value.length === 0) {
      throw new GithubError(
        'GitHub-токен не настроен. Положите PAT в хранилище DSH (refs.GITHUB_TOKEN в ~/.dsh/.credentials.yaml) — плагин не читает окружение и не вызывает gh.',
        undefined,
        'no-token',
      );
    }
    return hit.value;
  };

  /**
   * Perform one request against the fixed origin.
   * @param method - GET, POST, PATCH or PUT (checked by the caller's policy).
   * @param path - encoded path starting with "/".
   * @param options - optional query, JSON body, and Accept override.
   * @returns `{ status, data, text, truncated, rateLimit }`.
   */
  const request = async (method, path, options = {}) => {
    // Single choke point: nothing reaches the network without passing the
    // allowlist, whatever the calling tool intended.
    const verdict = check(method, path);
    if (!verdict.ok) {
      throw new GithubError(`Запрос отклонён политикой плагина — ${verdict.reason}`, undefined, 'policy');
    }
    const token = await resolveToken();
    const url = new URL(ORIGIN + path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }

    const headers = {
      accept: options.accept ?? 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': API_VERSION,
      'user-agent': 'dsh-github-safe/1.0',
    };
    let body;
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    // AbortSignal.timeout throws on expiry; keep the failure mode a clean error.
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, { method, headers, body, redirect: 'error', signal });
    } catch (error) {
      const reason = error?.name === 'TimeoutError'
        ? `таймаут ${REQUEST_TIMEOUT_MS} мс`
        : redact(error?.message ?? String(error), token);
      throw new GithubError(`GitHub недоступен: ${reason}`, undefined, 'network');
    }

    const rateLimit = {
      remaining: Number(response.headers.get('x-ratelimit-remaining') ?? '') || null,
      resetAt: Number(response.headers.get('x-ratelimit-reset') ?? '') || null,
    };

    let raw = '';
    try {
      raw = await response.text();
    } catch (error) {
      throw new GithubError(`Не удалось прочитать ответ GitHub: ${redact(error?.message, token)}`, response.status, 'read');
    }
    const truncated = raw.length > MAX_BODY_BYTES;
    const text = truncated ? raw.slice(0, MAX_BODY_BYTES) : raw;

    let data;
    try {
      data = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }

    if (!response.ok) {
      throw new GithubError(describeFailure(response.status, data, text, token, path), response.status, 'http');
    }
    return { status: response.status, data, text, truncated, rateLimit };
  };

  /** Report whether a token exists and how much quota is left. */
  const status = async () => {
    const token = await resolveToken();
    const response = await fetch(new URL('/rate_limit', ORIGIN), {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': API_VERSION,
        'user-agent': 'dsh-github-safe/1.0',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { ok: response.ok, status: response.status, rateLimit: {
      remaining: Number(response.headers.get('x-ratelimit-remaining') ?? '') || null,
      resetAt: Number(response.headers.get('x-ratelimit-reset') ?? '') || null,
    } };
  };

  return { request, status };
}

/**
 * Turn a failed response into a short, actionable message.
 * @param status - HTTP status code.
 * @param data - parsed JSON body when available.
 * @param text - raw body.
 * @param token - token to redact.
 * @param path - request path, used for endpoint-specific hints.
 * @returns the message.
 */
function describeFailure(status, data, text, token, path = '') {
  const message = typeof data?.message === 'string' ? redact(data.message, token) : '';
  if (status === 401) return 'GitHub отклонил токен (401). Проверьте PAT: срок действия и права на этот репозиторий.';
  if (status === 403 && /rate limit/i.test(message)) {
    return `Исчерпан лимит запросов токена (403). ${message}`;
  }
  if (status === 403) {
    // A write to contents fails this way when the token has Contents: Read only.
    const hint = path.includes('/contents')
      ? ' Для записи файла у токена должно быть право Contents: Read and write (Настройки → Плагины → GitHub → инструкция).'
      : '';
    return `Доступ запрещён (403): ${message || 'у токена нет нужного права'}${hint}`;
  }
  if (status === 404) return `Не найдено (404): ${message || 'репозиторий, файл или номер не существует либо недоступен токену'}`;
  if (status === 422) {
    const details = Array.isArray(data?.errors)
      ? data.errors.map((e) => e?.message ?? e?.code ?? '').filter(Boolean).join('; ')
      : '';
    return `GitHub отклонил данные (422): ${message}${details ? ` — ${details}` : ''}`;
  }
  if (status === 409) return `Конфликт (409): ${message || 'состояние изменилось, повторите чтение'}`;
  return `GitHub ответил ${status}: ${message || redact(text.slice(0, 300), token)}`;
}
