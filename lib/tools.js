/**
 * Model-facing tools of the GitHub plugin.
 *
 * Every handler builds its request from validated typed arguments, and the
 * client applies the allowlist before touching the network. Reads are free;
 * `github_issue_write`, `github_pr_write`, `github_file_write` and
 * `github_release_create` are intercepted by the approval gate in index.js, so
 * a write never happens without an explicit human decision.
 */

import { assertName, assertSegment, buildPath, describePolicy } from './policy.js';
import { GithubError, redact } from './http.js';
import { describeUpdate } from './update-check.js';

const MAX_FILE_CHARS = 20_000;
const MAX_TEXT_CHARS = 12_000;
const MAX_LIST = 100;

/** Canonical text output shared by every tool. */
const TEXT_OUTPUT = {
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: String(value) }],
};

/** Shorten a diagnostic string. */
function clip(value, limit = MAX_TEXT_CHARS) {
  const text = String(value ?? '');
  return text.length > limit ? `${text.slice(0, limit)}\n… (обрезано, всего ${text.length} символов)` : text;
}

/** Render one repository row. */
function repoLine(repo) {
  const flags = [repo.private ? 'private' : 'public', repo.archived ? 'archived' : null, repo.fork ? 'fork' : null]
    .filter(Boolean)
    .join(', ');
  return [
    `${repo.full_name} — ${repo.description ?? '(без описания)'}`,
    `  ${flags}; ветка по умолчанию: ${repo.default_branch}; ★ ${repo.stargazers_count}; форков ${repo.forks_count}; открытых issue ${repo.open_issues_count}`,
    `  ${repo.html_url}`,
  ].join('\n');
}

/** Render one issue/PR row. */
function issueLine(item) {
  const kind = item.pull_request ? 'PR' : 'issue';
  return `#${item.number} [${item.state}] ${item.title} (${kind}) — ${item.html_url}`;
}

/** Pull out `owner/repo` from validated arguments. */
function target(args) {
  const owner = assertName(args.owner, 'owner');
  const repo = assertName(args.repo, 'repo');
  return { owner, repo, base: buildPath('/repos', owner, repo) };
}

/**
 * Build every tool definition.
 * @param client - client from createClient.
 * @returns the definitions to register.
 */
export function createTools(client) {
  /** Run one guarded request and return the parsed body. */
  const call = async (method, path, options) => client.request(method, path, options);

  return [
    {
      name: 'github_status',
      description:
        'Show whether a GitHub token is configured for this plugin, the remaining REST quota, and the exact allowlist of endpoints the plugin may call. Read-only, no network mutation.',
      parameters: { type: 'object', properties: {} },
      output: TEXT_OUTPUT,
      async execute() {
        let head;
        try {
          const status = await client.status();
          head = status.ok
            ? `Токен: настроен, GitHub отвечает. Осталось запросов: ${status.rateLimit.remaining ?? 'н/д'}.`
            : `Токен: настроен, но GitHub ответил ${status.status}.`;
        } catch (error) {
          head = error instanceof GithubError && error.code === 'no-token'
            ? 'Токен: не настроен. Положите PAT в refs.GITHUB_TOKEN файла ~/.dsh/.credentials.yaml.'
            : `Токен: проверка не удалась — ${redact(error?.message, undefined)}`;
        }
        return `${head}\n${describeUpdate()}\n\n${describePolicy()}`;
      },
    },

    {
      name: 'github_repo',
      description:
        'Read repository metadata: description, visibility, default branch, stars, forks, language, license, topics. Read-only. Cannot change repository settings, visibility, or access.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Владелец репозитория (пользователь или организация).' },
          repo: { type: 'string', description: 'Имя репозитория.' },
        },
        required: ['owner', 'repo'],
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const { base } = target(args);
        const { data } = await call('GET', base);
        const topics = Array.isArray(data.topics) && data.topics.length > 0 ? `\n  темы: ${data.topics.join(', ')}` : '';
        const license = data.license?.spdx_id ? `\n  лицензия: ${data.license.spdx_id}` : '';
        // `permissions` is GitHub's own answer about what this token may do in
        // this repository: push=false means Contents is read-only for the token.
        const rights = data.permissions
          ? `\n  права токена: ${[
              data.permissions.admin ? 'admin' : null,
              data.permissions.push ? 'push (можно коммитить)' : null,
              data.permissions.pull ? 'pull (чтение)' : null,
            ].filter(Boolean).join(', ') || 'нет доступа'}`
          : '';
        return `${repoLine(data)}\n  язык: ${data.language ?? 'н/д'}; обновлён: ${data.updated_at}${license}${topics}${rights}`;
      },
    },

    {
      name: 'github_repo_create',
      description:
        'Create a new repository in the token owner\'s own account (`POST /user/repos`). Requires human approval. It only creates: an existing repository is never modified or deleted, and nothing about the account, profile or settings is read or changed.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Имя нового репозитория, например dsh-github-safe.' },
          description: { type: 'string', description: 'Короткое описание репозитория.' },
          private: { type: 'boolean', description: 'Приватный репозиторий; по умолчанию приватный.' },
          autoInit: { type: 'boolean', description: 'Создать с начальным README; по умолчанию пустой.' },
        },
        required: ['name'],
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const name = assertName(requireText(args.name, 'name'), 'name');
        const { data } = await call('POST', '/user/repos', {
          body: {
            name,
            description: typeof args.description === 'string' ? args.description : undefined,
            private: args.private !== false,
            auto_init: args.autoInit === true,
          },
        });
        return `Создан репозиторий ${data.full_name}: ${data.html_url}\nветка по умолчанию: ${data.default_branch}`;
      },
    },

    {
      name: 'github_file',
      description:
        'Read a file or list a directory at a branch, tag, or commit (defaults to the default branch). Returns decoded text for files and a name/type/size listing for directories. Read-only.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Владелец репозитория.' },
          repo: { type: 'string', description: 'Имя репозитория.' },
          path: { type: 'string', description: 'Путь внутри репозитория; пустая строка — корень.' },
          ref: { type: 'string', description: 'Ветка, тег или SHA. По умолчанию ветка основного репозитория.' },
        },
        required: ['owner', 'repo', 'path'],
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const { base } = target(args);
        const rawPath = typeof args.path === 'string' ? args.path.trim().replace(/^\/+/, '') : '';
        const suffix = rawPath === '' ? '' : `/${rawPath.split('/').map((part) => assertSegment(part, 'path')).join('/')}`;
        const ref = typeof args.ref === 'string' && args.ref.length > 0 ? assertSegment(args.ref, 'ref') : undefined;
        const { data, text } = await call('GET', `${base}/contents${suffix}`, { query: { ref } });

        if (Array.isArray(data)) {
          const rows = data.slice(0, MAX_LIST).map((entry) => `  ${entry.type === 'dir' ? 'd' : 'f'} ${entry.path}${entry.size ? ` (${entry.size} б)` : ''}`);
          const more = data.length > MAX_LIST ? `\n… ещё ${data.length - MAX_LIST} записей` : '';
          return `Каталог ${rawPath || '/'} (${data.length}):\n${rows.join('\n')}${more}`;
        }
        if (data?.type === 'file' && typeof data.content === 'string') {
          const decoded = Buffer.from(data.content, data.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
          return `${data.path} @ ${data.sha.slice(0, 12)} (${data.size} б)\n${'─'.repeat(40)}\n${clip(decoded, MAX_FILE_CHARS)}`;
        }
        if (data?.type === 'file') {
          return `${data.path} — файл, содержимое не отдано GitHub (возможно, бинарный или очень большой): ${clip(text, 500)}`;
        }
        return clip(text);
      },
    },

    {
      name: 'github_issue',
      description:
        'Read issues: list a repository\'s issues (pull requests excluded), get one issue, or read its comments. Read-only. Use github_issue_write to create, comment, close, or relabel.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Владелец репозитория.' },
          repo: { type: 'string', description: 'Имя репозитория.' },
          action: { type: 'string', enum: ['list', 'get', 'comments'], description: 'Что прочитать.' },
          number: { type: 'number', description: 'Номер issue (для get и comments).' },
          state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Фильтр для list, по умолчанию open.' },
          limit: { type: 'number', description: 'Сколько элементов вернуть, максимум 100.' },
        },
        required: ['owner', 'repo', 'action'],
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const { base } = target(args);
        const action = String(args.action);
        if (action === 'list') {
          const perPage = Math.min(Math.max(Number(args.limit) || 30, 1), MAX_LIST);
          const { data } = await call('GET', `${base}/issues`, {
            query: { state: args.state ?? 'open', per_page: perPage },
          });
          const issues = (Array.isArray(data) ? data : []).filter((item) => item.pull_request === undefined);
          if (issues.length === 0) return 'Issue не найдены.';
          return issues.map(issueLine).join('\n');
        }
        if (action === 'get') {
          const number = requireNumber(args.number, 'number');
          const { data } = await call('GET', `${base}/issues/${number}`);
          return [
            issueLine(data),
            `автор: ${data.user?.login ?? 'н/д'}; создано: ${data.created_at}; комментариев: ${data.comments}`,
            '─'.repeat(40),
            clip(data.body ?? '(без описания)'),
          ].join('\n');
        }
        if (action === 'comments') {
          const number = requireNumber(args.number, 'number');
          const { data } = await call('GET', `${base}/issues/${number}/comments`, { query: { per_page: MAX_LIST } });
          const comments = Array.isArray(data) ? data : [];
          if (comments.length === 0) return 'Комментариев нет.';
          return comments.map((c) => `— ${c.user?.login ?? '?'} @ ${c.created_at} (${c.html_url})\n${clip(c.body, 2000)}`).join('\n\n');
        }
        throw new GithubError(`Неизвестное действие "${action}"`, undefined, 'args');
      },
    },

    {
      name: 'github_review',
      description:
        'Read one pull request: metadata, changed files, review comments, CI checks, and optionally the unified diff. Read-only. Use github_pr_write for merge, review submission, or comments.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Владелец репозитория.' },
          repo: { type: 'string', description: 'Имя репозитория.' },
          number: { type: 'number', description: 'Номер pull request.' },
          diff: { type: 'boolean', description: 'Включить unified diff (может быть большим).' },
        },
        required: ['owner', 'repo', 'number'],
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const { base } = target(args);
        const number = requireNumber(args.number, 'number');
        const { data: pr } = await call('GET', `${base}/pulls/${number}`);
        const sections = [
          `#${pr.number} ${pr.title}`,
          `  ${pr.state}${pr.draft ? ' (draft)' : ''}; ${pr.base?.ref} ← ${pr.head?.ref}; mergeable: ${pr.mergeable ?? 'н/д'}`,
          `  автор: ${pr.user?.login ?? 'н/д'}; ${pr.html_url}`,
        ];

        const { data: files } = await call('GET', `${base}/pulls/${number}/files`, { query: { per_page: MAX_LIST } });
        if (Array.isArray(files) && files.length > 0) {
          sections.push('', `Файлы (${files.length}):`);
          for (const file of files) {
            sections.push(`  ${file.status} ${file.filename} +${file.additions}/-${file.deletions}`);
          }
        }

        const { data: comments } = await call('GET', `${base}/pulls/${number}/comments`, { query: { per_page: MAX_LIST } });
        if (Array.isArray(comments) && comments.length > 0) {
          sections.push('', `Review-комментарии (${comments.length}):`);
          for (const comment of comments) {
            sections.push(`  — ${comment.user?.login ?? '?'} на ${comment.path}:${comment.line ?? '?'}: ${clip(comment.body, 600)}`);
          }
        }

        if (pr.head?.sha) {
          const { data: checks } = await call('GET', `${base}/commits/${pr.head.sha}/check-runs`, { query: { per_page: MAX_LIST } });
          const runs = Array.isArray(checks?.check_runs) ? checks.check_runs : [];
          sections.push('', runs.length === 0 ? 'Проверки: нет' : `Проверки (${runs.length}):`);
          for (const run of runs) {
            sections.push(`  ${run.status}/${run.conclusion ?? '—'} ${run.name}`);
          }
        }

        if (args.diff === true) {
          const { text } = await call('GET', `${base}/pulls/${number}`, { accept: 'application/vnd.github.diff' });
          sections.push('', 'Diff:', clip(text, MAX_TEXT_CHARS));
        }
        return sections.join('\n');
      },
    },

    {
      name: 'github_search',
      description:
        'Search GitHub repositories, issues/pull requests, or code. Read-only. Uses the search quota of the token.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Поисковый запрос GitHub, например "repo:owner/name is:issue crash".' },
          kind: { type: 'string', enum: ['repositories', 'issues', 'code'], description: 'Что искать.' },
          limit: { type: 'number', description: 'Сколько результатов вернуть, максимум 50.' },
        },
        required: ['query', 'kind'],
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const kind = String(args.kind);
        const query = String(args.query ?? '').trim();
        if (query.length === 0) throw new GithubError('Пустой поисковый запрос', undefined, 'args');
        if (!['repositories', 'issues', 'code'].includes(kind)) {
          throw new GithubError(`Неизвестный тип поиска "${kind}"`, undefined, 'args');
        }
        const perPage = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
        const { data } = await call('GET', `/search/${kind}`, { query: { q: query, per_page: perPage } });
        const items = Array.isArray(data?.items) ? data.items : [];
        if (items.length === 0) return `Ничего не найдено (всего: ${data?.total_count ?? 0}).`;
        const header = `Найдено: ${data?.total_count ?? items.length}, показано ${items.length}:`;
        const rows = items.map((item) => {
          if (kind === 'repositories') return `  ${item.full_name} ★${item.stargazers_count} — ${item.description ?? ''}`;
          if (kind === 'issues') return `  ${issueLine(item)}`;
          return `  ${item.repository?.full_name ?? ''}/${item.path} — ${item.html_url}`;
        });
        return [header, ...rows].join('\n');
      },
    },

    {
      name: 'github_issue_write',
      description:
        'Write to issues: create an issue, comment on it, close or reopen it, or change its title/body/labels. Requires human approval. Cannot delete an issue or touch the account.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Владелец репозитория.' },
          repo: { type: 'string', description: 'Имя репозитория.' },
          action: { type: 'string', enum: ['create', 'comment', 'close', 'reopen', 'update'], description: 'Действие.' },
          number: { type: 'number', description: 'Номер issue (для comment/close/reopen/update).' },
          title: { type: 'string', description: 'Заголовок (create/update).' },
          body: { type: 'string', description: 'Текст (create/comment/update).' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Метки (create/update).' },
        },
        required: ['owner', 'repo', 'action'],
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const { base } = target(args);
        const action = String(args.action);
        if (action === 'create') {
          const title = requireText(args.title, 'title');
          const { data } = await call('POST', `${base}/issues`, {
            body: { title, body: typeof args.body === 'string' ? args.body : undefined, labels: args.labels },
          });
          return `Создан issue #${data.number}: ${data.html_url}`;
        }
        if (action === 'comment') {
          const number = requireNumber(args.number, 'number');
          const body = requireText(args.body, 'body');
          const { data } = await call('POST', `${base}/issues/${number}/comments`, { body: { body } });
          return `Комментарий добавлен: ${data.html_url}`;
        }
        if (action === 'close' || action === 'reopen') {
          const number = requireNumber(args.number, 'number');
          const { data } = await call('PATCH', `${base}/issues/${number}`, {
            body: { state: action === 'close' ? 'closed' : 'open' },
          });
          return `Issue #${data.number} → ${data.state}: ${data.html_url}`;
        }
        if (action === 'update') {
          const number = requireNumber(args.number, 'number');
          const patch = {};
          if (typeof args.title === 'string') patch.title = args.title;
          if (typeof args.body === 'string') patch.body = args.body;
          if (Array.isArray(args.labels)) patch.labels = args.labels;
          if (Object.keys(patch).length === 0) throw new GithubError('Нечего обновлять: передайте title, body или labels', undefined, 'args');
          const { data } = await call('PATCH', `${base}/issues/${number}`, { body: patch });
          return `Issue #${data.number} обновлён: ${data.html_url}`;
        }
        throw new GithubError(`Неизвестное действие "${action}"`, undefined, 'args');
      },
    },

    {
      name: 'github_pr_write',
      description:
        'Write to pull requests: create, update (title/body/state/base), merge, submit a review (comment/approve/request changes), or post a comment. Requires human approval. The plugin never deletes branches or repositories.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Владелец репозитория.' },
          repo: { type: 'string', description: 'Имя репозитория.' },
          action: { type: 'string', enum: ['create', 'update', 'merge', 'review', 'comment'], description: 'Действие.' },
          number: { type: 'number', description: 'Номер PR (кроме create).' },
          title: { type: 'string', description: 'Заголовок (create/update).' },
          body: { type: 'string', description: 'Текст (create/update/review/comment).' },
          base: { type: 'string', description: 'Целевая ветка (create/update).' },
          head: { type: 'string', description: 'Исходная ветка (create).' },
          draft: { type: 'boolean', description: 'Создать черновиком (create).' },
          state: { type: 'string', enum: ['open', 'closed'], description: 'Состояние (update).' },
          mergeMethod: { type: 'string', enum: ['merge', 'squash', 'rebase'], description: 'Способ слияния, по умолчанию merge.' },
          event: { type: 'string', enum: ['COMMENT', 'APPROVE', 'REQUEST_CHANGES'], description: 'Тип ревью (review).' },
        },
        required: ['owner', 'repo', 'action'],
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const { base } = target(args);
        const action = String(args.action);
        if (action === 'create') {
          const title = requireText(args.title, 'title');
          const head = requireText(args.head, 'head');
          const targetBranch = requireText(args.base, 'base');
          const { data } = await call('POST', `${base}/pulls`, {
            body: { title, head, base: targetBranch, body: typeof args.body === 'string' ? args.body : undefined, draft: args.draft === true },
          });
          return `Создан PR #${data.number}: ${data.html_url}`;
        }
        if (action === 'update') {
          const number = requireNumber(args.number, 'number');
          const patch = {};
          if (typeof args.title === 'string') patch.title = args.title;
          if (typeof args.body === 'string') patch.body = args.body;
          if (typeof args.base === 'string') patch.base = assertSegment(args.base, 'base');
          if (typeof args.state === 'string') patch.state = args.state;
          if (Object.keys(patch).length === 0) throw new GithubError('Нечего обновлять: передайте title, body, base или state', undefined, 'args');
          const { data } = await call('PATCH', `${base}/pulls/${number}`, { body: patch });
          return `PR #${data.number} обновлён (${data.state}): ${data.html_url}`;
        }
        if (action === 'merge') {
          const number = requireNumber(args.number, 'number');
          const method = args.mergeMethod ?? 'merge';
          if (!['merge', 'squash', 'rebase'].includes(method)) throw new GithubError(`Неизвестный способ слияния "${method}"`, undefined, 'args');
          const { data } = await call('PUT', `${base}/pulls/${number}/merge`, { body: { merge_method: method } });
          return data.merged === true
            ? `PR #${number} смёржен (${data.sha?.slice(0, 12)}): ${data.message}`
            : `GitHub отказал в слиянии: ${data.message}`;
        }
        if (action === 'review') {
          const number = requireNumber(args.number, 'number');
          const event = args.event ?? 'COMMENT';
          if (!['COMMENT', 'APPROVE', 'REQUEST_CHANGES'].includes(event)) throw new GithubError(`Неизвестный тип ревью "${event}"`, undefined, 'args');
          const body = typeof args.body === 'string' ? args.body : '';
          if (event !== 'APPROVE' && body.trim().length === 0) throw new GithubError('Для COMMENT и REQUEST_CHANGES нужен body', undefined, 'args');
          const { data } = await call('POST', `${base}/pulls/${number}/reviews`, { body: { event, body } });
          return `Ревью отправлено (${event}): ${data.html_url ?? `id ${data.id}`}`;
        }
        if (action === 'comment') {
          const number = requireNumber(args.number, 'number');
          const body = requireText(args.body, 'body');
          const { data } = await call('POST', `${base}/pulls/${number}/comments`, { body: { body } });
          return `Комментарий к PR добавлен: ${data.html_url}`;
        }
        throw new GithubError(`Неизвестное действие "${action}"`, undefined, 'args');
      },
    },

    {
      name: 'github_file_write',
      description:
        'Commit a file creation or update to a branch (single-file commit). Requires human approval. There is no delete: removing files or branches is outside the plugin.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Владелец репозитория.' },
          repo: { type: 'string', description: 'Имя репозитория.' },
          path: { type: 'string', description: 'Путь файла в репозитории.' },
          content: { type: 'string', description: 'Новое содержимое файла (текст).' },
          message: { type: 'string', description: 'Сообщение коммита.' },
          branch: { type: 'string', description: 'Ветка; по умолчанию ветка основного репозитория.' },
          sha: { type: 'string', description: 'SHA текущей версии файла при обновлении (обязательно, если файл уже есть).' },
        },
        required: ['owner', 'repo', 'path', 'content', 'message'],
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const { base } = target(args);
        const content = requireText(args.content, 'content');
        const message = requireText(args.message, 'message');
        const filePath = String(args.path ?? '').trim().replace(/^\/+/, '');
        if (filePath.length === 0) throw new GithubError('path не может быть пустым', undefined, 'args');
        const encoded = filePath.split('/').map((part) => assertSegment(part, 'path')).join('/');
        const body = {
          message,
          content: Buffer.from(content, 'utf8').toString('base64'),
          branch: typeof args.branch === 'string' && args.branch.length > 0 ? assertSegment(args.branch, 'branch') : undefined,
          sha: typeof args.sha === 'string' && args.sha.length > 0 ? assertSegment(args.sha, 'sha') : undefined,
        };
        const { data } = await call('PUT', `${base}/contents/${encoded}`, { body });
        return `Файл ${filePath} закоммичен (${data.commit?.sha?.slice(0, 12) ?? 'sha н/д'}): ${data.commit?.html_url ?? ''}`;
      },
    },

    {
      name: 'github_push_files',
      description:
        'Commit many files in a single commit (bulk upload): builds blobs, one tree and one commit through the Git Data API, then moves the branch. Requires human approval. Existing files are overwritten, nothing is deleted, and the branch is updated without force.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Владелец репозитория.' },
          repo: { type: 'string', description: 'Имя репозитория.' },
          files: {
            type: 'array',
            description: 'Файлы: path относительно корня репозитория и полный текст content.',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Путь файла.' },
                content: { type: 'string', description: 'Полное содержимое файла.' },
              },
              required: ['path', 'content'],
            },
          },
          message: { type: 'string', description: 'Сообщение коммита.' },
          branch: { type: 'string', description: 'Ветка; по умолчанию ветка основного репозитория.' },
        },
        required: ['owner', 'repo', 'files', 'message'],
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const { base, owner, repo } = target(args);
        const message = requireText(args.message, 'message');
        const files = Array.isArray(args.files) ? args.files : [];
        if (files.length === 0) throw new GithubError('files: нужен хотя бы один файл', undefined, 'args');
        if (files.length > 200) throw new GithubError('files: максимум 200 файлов за коммит', undefined, 'args');

        const entries = files.map((file) => {
          const path = normalizeRepoPath(file?.path);
          if (typeof file?.content !== 'string') {
            throw new GithubError(`files: у "${path}" нет строкового content`, undefined, 'args');
          }
          return { path, mode: '100644', type: 'blob', content: file.content };
        });

        let branch = typeof args.branch === 'string' && args.branch.length > 0
          ? assertSegment(args.branch, 'branch')
          : undefined;
        if (branch === undefined) {
          const { data: meta } = await call('GET', base);
          branch = meta.default_branch;
        }

        // An empty repository has no branch to build on: the first commit gets
        // no parent and the ref is created instead of moved.
        let parentSha;
        try {
          const { data: ref } = await call('GET', `${base}/git/ref/heads/${branch}`);
          parentSha = ref?.object?.sha;
        } catch (error) {
          // 404 — the branch does not exist yet; 409 "Git Repository is empty" —
          // the repository has no commit at all.
          if (!(error instanceof GithubError) || (error.status !== 404 && error.status !== 409)) throw error;
        }

        // The trees API refuses to run in a repository without commits, so an
        // empty repository gets one bootstrap commit through the Contents API.
        if (parentSha === undefined) {
          await call('PUT', `${base}/contents/.gitignore`, {
            body: {
              message: 'chore: bootstrap repository',
              content: Buffer.from('node_modules/\n*.log\n.DS_Store\n', 'utf8').toString('base64'),
              branch,
            },
          });
          const { data: ref } = await call('GET', `${base}/git/ref/heads/${branch}`);
          parentSha = ref?.object?.sha;
        }
        if (parentSha === undefined) {
          throw new GithubError('Не удалось получить родительский коммит после начальной загрузки', undefined, 'http');
        }

        const { data: parent } = await call('GET', `${base}/git/commits/${parentSha}`);
        const treeBody = { tree: entries, base_tree: parent.tree.sha };
        const { data: tree } = await call('POST', `${base}/git/trees`, { body: treeBody });
        const { data: commit } = await call('POST', `${base}/git/commits`, {
          body: { message, tree: tree.sha, parents: [parentSha] },
        });

        await call('PATCH', `${base}/git/refs/heads/${branch}`, { body: { sha: commit.sha, force: false } });

        return `Закоммичено ${entries.length} файлов в ${owner}/${repo}@${branch}: ${String(commit.sha).slice(0, 12)}\n${commit.html_url ?? ''}`;
      },
    },

    {
      name: 'github_release_create',
      description:
        'Create a GitHub release for an existing tag. Requires human approval. Deleting or editing a published release beyond its description stays out of scope.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Владелец репозитория.' },
          repo: { type: 'string', description: 'Имя репозитория.' },
          tag: { type: 'string', description: 'Существующий тег.' },
          name: { type: 'string', description: 'Название релиза.' },
          body: { type: 'string', description: 'Описание релиза.' },
          draft: { type: 'boolean', description: 'Черновик.' },
          prerelease: { type: 'boolean', description: 'Пре-релиз.' },
        },
        required: ['owner', 'repo', 'tag'],
      },
      output: TEXT_OUTPUT,
      async execute(args) {
        const { base } = target(args);
        const tag = requireText(args.tag, 'tag');
        const { data } = await call('POST', `${base}/releases`, {
          body: {
            tag_name: tag,
            name: typeof args.name === 'string' ? args.name : undefined,
            body: typeof args.body === 'string' ? args.body : undefined,
            draft: args.draft === true,
            prerelease: args.prerelease === true,
          },
        });
        return `Релиз ${data.tag_name} создан: ${data.html_url}`;
      },
    },
  ];
}

/** Read a required positive integer argument. */
function requireNumber(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new GithubError(`${label}: ожидается положительное целое число`, undefined, 'args');
  }
  return number;
}

/** Read a required non-empty string argument. */
function requireText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new GithubError(`${label}: ожидается непустая строка`, undefined, 'args');
  }
  return value;
}

/** Validate and normalise a repository-relative path. */
function normalizeRepoPath(value) {
  const raw = String(value ?? '').trim().replace(/^\/+/, '');
  if (raw.length === 0) throw new GithubError('path не может быть пустым', undefined, 'args');
  return raw.split('/').map((part) => assertSegment(part, 'path')).join('/');
}
