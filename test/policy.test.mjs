import test from 'node:test';
import assert from 'node:assert/strict';

import { check, buildPath, assertName, assertSegment } from '../lib/policy.js';

const allow = (method, path, note) => {
  const verdict = check(method, path);
  assert.equal(verdict.ok, true, `ожидалось разрешение для ${method} ${path}, получено: ${verdict.reason}`);
  if (note) assert.equal(verdict.note, note);
};

const deny = (method, path, hint) => {
  const verdict = check(method, path);
  assert.equal(verdict.ok, false, `ожидался запрет для ${method} ${path}`);
  if (hint) assert.match(verdict.reason, hint);
};

test('разрешённые чтения', () => {
  allow('GET', '/repos/acme/app', 'метаданные репозитория');
  allow('GET', '/repos/acme/app/contents/src/index.ts');
  allow('GET', '/repos/acme/app/issues');
  allow('GET', '/repos/acme/app/issues/12');
  allow('GET', '/repos/acme/app/issues/12/comments');
  allow('GET', '/repos/acme/app/pulls');
  allow('GET', '/repos/acme/app/pulls/7');
  allow('GET', '/repos/acme/app/pulls/7/files');
  allow('GET', '/repos/acme/app/commits/abc123/check-runs');
  allow('GET', '/repos/acme/app/releases');
  allow('GET', '/repos/acme/app/actions/runs/42/jobs');
  allow('GET', '/search/repositories');
  allow('GET', '/rate_limit');
});

test('разрешённые записи только в контент репозитория', () => {
  allow('POST', '/repos/acme/app/issues');
  allow('POST', '/repos/acme/app/issues/12/comments');
  allow('POST', '/repos/acme/app/pulls');
  allow('POST', '/repos/acme/app/pulls/7/reviews');
  allow('PATCH', '/repos/acme/app/issues/12');
  allow('PATCH', '/repos/acme/app/pulls/7');
  allow('PUT', '/repos/acme/app/pulls/7/merge');
  allow('PUT', '/repos/acme/app/contents/README.md');
  allow('POST', '/repos/acme/app/git/blobs');
  allow('POST', '/repos/acme/app/git/trees');
  allow('POST', '/repos/acme/app/git/commits');
  allow('POST', '/repos/acme/app/git/refs');
  allow('PATCH', '/repos/acme/app/git/refs/heads/main');
  allow('GET', '/repos/acme/app/git/ref/heads/main');
});

test('DELETE запрещён всегда', () => {
  deny('DELETE', '/repos/acme/app', /DELETE/);
  deny('DELETE', '/repos/acme/app/contents/README.md', /DELETE/);
  deny('DELETE', '/repos/acme/app/git/refs/heads/feature', /DELETE/);
});
test('аккаунт и профиль недостижимы', () => {
  deny('GET', '/user', /профил/);
  deny('PATCH', '/user', /профил/);
  deny('GET', '/user/emails', /профил/);
  deny('POST', '/user/keys', /профил/);
  deny('GET', '/users/someone', /профил/);
  deny('DELETE', '/user', /DELETE|профил/);
});

test('создание репозитория — единственное исключение в /user', () => {
  const verdict = check('POST', '/user/repos');
  assert.equal(verdict.ok, true, 'POST /user/repos должен быть разрешён');
  assert.match(verdict.note, /создать новый репозиторий/);
  deny('GET', '/user/repos', /allowlist|профил/);
  deny('PATCH', '/user/repos/1', /профил|allowlist/);
  deny('POST', '/user/repos/1/transfer', /профил|allowlist/);
});

test('организации, приложения, админка недостижимы', () => {
  deny('GET', '/orgs/acme', /организаци/);
  deny('POST', '/orgs/acme/invitations', /организаци/);
  deny('GET', '/teams/1/members', /команд/);
  deny('GET', '/app/installations', /Apps/);
  deny('GET', '/installations/1', /установки/);
  deny('GET', '/marketplace_listing/plans', /маркетплейс/);
  deny('GET', '/admin/stats', /админ/);
  deny('POST', '/graphql', /GraphQL/);
});

test('управление доступом к репозиторию запрещено', () => {
  deny('PUT', '/repos/acme/app/collaborators/mallory', /collaborators|allowlist/);
  deny('GET', '/repos/acme/app/collaborators', /collaborators/);
  deny('POST', '/repos/acme/app/hooks', /вебхук/);
  deny('POST', '/repos/acme/app/keys', /deploy-ключ/);
  deny('PUT', '/repos/acme/app/actions/secrets/TOKEN', /секрет/);
  deny('POST', '/repos/acme/app/transfer', /передач/);
  deny('POST', '/repos/acme/app/forks', /allowlist/);
});

test('смена настроек самого репозитория запрещена', () => {
  deny('PATCH', '/repos/acme/app', /allowlist|доступен только/);
  deny('PATCH', '/repos/acme/app/topics', /allowlist/);
  deny('GET', '/repos/acme/app/subscription', /подписк/);
});

test('обход пути не проходит', () => {
  deny('GET', '/repos/acme/app/../../user', /недопустимые/);
  deny('GET', '/repos//app', /недопустимые/);
  deny('GET', '/repos/acme/app\\..\\user', /недопустимые/);
  deny('GET', 'repos/acme/app', /некорректный путь/);
  deny('GET', '/repos/acme/app?x=1', /недопустимые/);
});

test('неизвестный эндпоинт не проходит', () => {
  deny('GET', '/repos/acme/app/traffic/views', /allowlist/);
  deny('POST', '/repos/acme/app/merges', /allowlist/);
  deny('GET', '/emojis', /allowlist/);
});

test('buildPath кодирует динамические сегменты', () => {
  assert.equal(buildPath('/repos', 'acme', 'app', 'contents', 'a b.txt'), '/repos/acme/app/contents/a%20b.txt');
  assert.throws(() => buildPath('/repos', 'acme', '..', 'contents'), /недопустимое значение/);
  assert.throws(() => buildPath('/repos', 'acme', 'a/b'), /недопустимое значение/);
});

test('имена владельца и репозитория валидируются', () => {
  assert.equal(assertName('acme-org', 'owner'), 'acme-org');
  assert.throws(() => assertName('-acme', 'owner'), /ожидается имя/);
  assert.throws(() => assertName('', 'owner'), /непустая строка/);
  assert.throws(() => assertSegment('a\u0000b', 'path'), /управляющие символы/);
});
