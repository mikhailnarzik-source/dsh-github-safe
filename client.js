/**
 * Browser half of `dsh-github-safe`.
 *
 * Contributes one card to the Plugins page: current token state, a masked input
 * that writes the PAT straight into the DSH credential store (never into the
 * plugin's configuration), a remove button, and a short recipe for creating a
 * minimal fine-grained token.
 *
 * The card never receives the token: `credentials.describe` answers only
 * whether one is configured, and `credentials.set` is write-only.
 */
window.__ModuleLoader__.load({
  id: 'dsh-github-safe',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const React = require('react');
    const h = React.createElement;

    const NS = 'githubSafe';
    const REF = 'GITHUB_TOKEN';
    const VERIFY_PATH = '/api/github-safe/verify';
    const UPDATE_PATH = '/api/github-safe/update';
    const short = (sha) => (sha === null || sha === undefined ? '?' : String(sha).slice(0, 7));

    const en = {
      title: 'GitHub',
      summarySet: 'Token configured',
      summaryUnset: 'Token not configured',
      pageTitle: 'GitHub access',
      pageSubtitle: 'Personal access token for the GitHub REST API, kept in the DSH credential store',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      tokenSection: 'Access token',
      tokenLabel: 'Personal access token',
      placeholderSet: '•••••••• (enter a new value to replace)',
      placeholderUnset: 'github_pat_…',
      save: 'Save',
      saving: 'Saving…',
      clear: 'Remove token',
      cleared: 'Token removed. GitHub tools are unavailable until a new one is stored.',
      saved: 'Saved. Applied immediately, no restart needed.',
      failed: 'Could not save the token.',
      checking: 'Checking the token with GitHub…',
      accepted: 'GitHub accepted the token',
      rejected: 'GitHub rejected the token',
      missing: 'No token is stored',
      unreachable: 'Could not reach GitHub',
      again: 'Check again',
      quota: 'Requests left:',
      updateTitle: 'Plugin update',
      updateCurrent: 'up to date',
      updateAvailable: 'update available',
      updateUnknown: 'state unknown',
      updateButton: 'Update',
      updateStarting: 'Updating…',
      updateScheduled: 'Update started. Restart DSH to load the new version.',
      updateNoop: 'No update needed.',
      storedIn: 'Stored in the DSH credential store (refs.GITHUB_TOKEN), not in the plugin configuration.',
      readonly: 'This deployment stores credentials read-only.',
      setBadge: 'configured',
      unsetBadge: 'not configured',
      howTitle: 'How to create the token',
      step1: 'Open GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.',
      step2: 'Repository access: Only select repositories — pick exactly the repositories you want the agent to work with.',
      step3: 'Expiration: 90 days (renew instead of creating a never-expiring token).',
      step4: 'Permissions: grant exactly the set in the table below — nothing more.',
      step5: 'Generate the token and paste the github_pat_… value into the field above.',
      permTitle: 'Token permissions',
      permColPermission: 'Permission',
      permColLevel: 'Level',
      permColUse: 'What it enables',
      permMetadataUse: 'always required: access to the repository itself',
      permContentsUse: 'read files and commit: github_file, github_file_write, github_push_files, github_release_create, code search',
      permIssuesUse: 'issues: list, read, comment, create, close',
      permPullsUse: 'pull requests: read, files, reviews, comments, merge',
      permStatusesUse: 'commit statuses (only if you need status checks)',
      permChecksUse: 'CI checks of a pull request: github_review',
      permAdminUse: 'create new repositories: github_repo_create',
      permAccessNote: 'Repository access: All repositories — otherwise new repositories are invisible and creation is refused.',
      permNote: 'Administration is needed only to create repositories. Without it every other tool works, but creating a repository fails.',
      noteExisting: 'Already created the token with Contents → Read? Open it, set Repository permissions → Contents → Read and write, save. The token value does not change — no need to reissue it, the plugin picks up the new rights as is.',
      warnTitle: 'Do not grant',
      warnBody: 'Administration, Secrets, Collaborators, Actions (write), Webhooks, Deploy keys. The plugin has no endpoint to use them — it cannot change account settings, members, or delete anything.',
      openGithub: 'Create a token on GitHub',
      policyTitle: 'What the plugin may do',
      policyBody: 'Allowlist, deny by default: repository content only. Reads: repo, branches, files, issues, pull requests, checks, releases, search. Writes (each requires your approval): create/comment/close issues, create/merge/review pull requests, commit files, create releases. No DELETE of any kind, no /user, no /orgs, no collaborators.',
    };

    const ru = {
      title: 'GitHub',
      summarySet: 'Токен настроен',
      summaryUnset: 'Токен не настроен',
      pageTitle: 'Доступ к GitHub',
      pageSubtitle: 'Personal access token для REST API GitHub, хранится в хранилище секретов DSH',
      refresh: 'Обновить',
      refreshing: 'Обновляю…',
      tokenSection: 'Токен доступа',
      tokenLabel: 'Personal access token',
      placeholderSet: '•••••••• (введите новое значение, чтобы заменить)',
      placeholderUnset: 'github_pat_…',
      save: 'Сохранить',
      saving: 'Сохраняем…',
      clear: 'Удалить токен',
      cleared: 'Токен удалён. GitHub-инструменты недоступны, пока не сохранён новый.',
      saved: 'Сохранено. Действует сразу, перезапуск не нужен.',
      failed: 'Не удалось сохранить токен.',
      checking: 'Проверяем токен на GitHub…',
      accepted: 'GitHub принял токен',
      rejected: 'GitHub отклонил токен',
      missing: 'Токен не сохранён',
      unreachable: 'GitHub не ответил',
      again: 'Проверить снова',
      quota: 'Осталось запросов:',
      updateTitle: 'Обновление плагина',
      updateCurrent: 'актуально',
      updateAvailable: 'доступно обновление',
      updateUnknown: 'состояние неизвестно',
      updateButton: 'Обновить',
      updateStarting: 'Обновляем…',
      updateScheduled: 'Обновление запущено. Перезапустите DSH, чтобы загрузить новую версию.',
      updateNoop: 'Обновление не требуется.',
      storedIn: 'Хранится в хранилище секретов DSH (refs.GITHUB_TOKEN), а не в конфигурации плагина.',
      readonly: 'В этом окружении хранилище секретов доступно только для чтения.',
      setBadge: 'настроен',
      unsetBadge: 'не настроен',
      howTitle: 'Как создать токен',
      step1: 'GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.',
      step2: 'Repository access: Only select repositories — выбери ровно те репозитории, с которыми должен работать агент.',
      step3: 'Expiration: 90 дней (лучше продлевать, чем создавать бессрочный токен).',
      step4: 'Permissions: выдай ровно тот набор, что в таблице ниже — ничего лишнего.',
      step5: 'Сгенерируй токен и вставь значение github_pat_… в поле выше.',
      permTitle: 'Права токена',
      permColPermission: 'Право',
      permColLevel: 'Уровень',
      permColUse: 'Что включает',
      permMetadataUse: 'обязателен всегда: сам доступ к репозиторию',
      permContentsUse: 'чтение файлов и коммиты: github_file, github_file_write, github_push_files, github_release_create, поиск кода',
      permIssuesUse: 'issue: список, чтение, комментарии, создание, закрытие',
      permPullsUse: 'pull request: чтение, файлы, ревью, комментарии, merge',
      permStatusesUse: 'статусы коммитов (нужно, только если нужны проверки)',
      permChecksUse: 'CI-проверки pull request: github_review',
      permAdminUse: 'создание новых репозиториев: github_repo_create',
      permAccessNote: 'Repository access: All repositories — иначе новые репозитории не видны, а создание не сработает.',
      permNote: 'Administration нужен только для создания репозиториев. Без него работают все остальные инструменты, но создать репозиторий не получится.',
      noteExisting: 'Токен уже создан с Contents → Read? Открой его, поменяй Repository permissions → Contents → Read and write и сохрани. Сам токен при этом не меняется — перевыпускать не нужно, плагин сразу увидит новые права.',
      warnTitle: 'Не выдавай',
      warnBody: 'Administration, Secrets, Collaborators, Actions (write), Webhooks, Deploy keys. У плагина нет эндпоинтов, где они нужны — он не может менять настройки аккаунта, участников или что-то удалять.',
      openGithub: 'Создать токен на GitHub',
      policyTitle: 'Что плагину разрешено',
      policyBody: 'Allowlist, запрет по умолчанию: только содержимое репозиториев. Чтение: репозиторий, ветки, файлы, issue, pull request, проверки, релизы, поиск. Запись (каждый раз с подтверждением): создать/прокомментировать/закрыть issue, создать/смёржить/отревьювить PR, закоммитить файл, создать релиз. Никакого DELETE, никаких /user, /orgs, collaborators.',
    };

    /** Element styling kept inline so the card follows the host theme without importing CSS. */
        // Нативные поля и списки рисуются системными цветами: без color-scheme
    // они остаются светлыми в тёмной теме и светлыми в светлой.
    const themeScheme = () => {
      try {
        const background = getComputedStyle(document.body).backgroundColor;
        const parts = background.match(/[0-9.]+/g);
        if (parts === null || parts.length < 3) return 'dark';
        const [r, g, b] = parts.map(Number);
        return r * 0.299 + g * 0.587 + b * 0.114 > 140 ? 'light' : 'dark';
      } catch {
        return 'dark';
      }
    };
    /** Общий каркас: центрированная страница maxWidth 960, шапка с иконкой, карточки-секции. */
    const PAGE_MAX_WIDTH = 960
    const BUTTON = {
      boxSizing: 'border-box',
      height: 36,
      padding: '0 14px',
      borderRadius: 10,
      font: 'inherit',
      fontSize: 12.5,
      fontWeight: 600,
      lineHeight: '20px',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      whiteSpace: 'nowrap',
      transition: 'background-color .12s ease,border-color .12s ease,color .12s ease',
    }
    /** Мягкая заливка brand: текст остаётся brand и читается в обеих темах. */
    const S = {
      page: {
        width: '100%',
        maxWidth: PAGE_MAX_WIDTH,
        margin: '0 auto',
        padding: '24px 28px 40px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        color: 'var(--dsw-alias-label-primary)',
      },
      header: { display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' },
      logo: {
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 52,
        height: 52,
        borderRadius: 14,
        fontSize: 26,
        lineHeight: 1,
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 92%, transparent), color-mix(in srgb, var(--dsw-alias-brand-primary) 62%, transparent))',
        boxShadow: '0 6px 16px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent)',
      },
      heading: { display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 240px', minWidth: 0 },
      h1: {
        margin: 0,
        fontSize: 20,
        fontWeight: 600,
        lineHeight: '26px',
        color: 'var(--dsw-alias-label-primary)',
      },
      sub: {
        margin: 0,
        fontSize: 12.5,
        fontWeight: 400,
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      },
      actions: { display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' },
      card: {
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 14,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 0,
      },
      sectionTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        margin: 0,
        fontSize: 14,
        fontWeight: 600,
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-primary)',
      },
      accent: {
        display: 'inline-block',
        flex: 'none',
        width: 3,
        height: 14,
        borderRadius: 2,
        background: 'var(--dsw-alias-brand-primary)',
      },
      subTitle: {
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        fontWeight: 600,
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-primary)',
      },
      row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 },
      label: { fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-secondary)' },
      input: {
        flex: '1 1 220px',
        minWidth: 0,
        height: 34,
        padding: '0 10px',
        borderRadius: 9,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 12.5,
        colorScheme: themeScheme(),
      },
      primary: {
        ...BUTTON,
        border: '1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent)',
        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent)',
        color: 'var(--dsw-alias-brand-primary)',
      },
      secondary: {
        ...BUTTON,
        border: '1px solid var(--dsw-alias-border-l4)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
      },
      danger: {
        ...BUTTON,
        border: '1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 50%, transparent)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 16%, transparent)',
        color: 'var(--dsw-alias-state-error-primary)',
      },
      small: { height: 32, padding: '0 12px' },
      off: { opacity: 0.55, cursor: 'default' },
      chip: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px',
        borderRadius: 999,
        fontSize: 12,
        lineHeight: '17px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
        whiteSpace: 'nowrap',
      },
      chipOk: {
        border: '1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 55%, transparent)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent)',
        color: 'var(--dsw-alias-state-success-primary)',
      },
      chipBad: {
        border: '1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, transparent)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)',
        color: 'var(--dsw-alias-state-error-primary)',
      },
      chipWarn: {
        border: '1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, transparent)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent)',
        color: 'var(--dsw-alias-state-warn-primary)',
      },
      dot: (color) => ({ flex: 'none', width: 6, height: 6, borderRadius: '50%', background: color }),
      badgeOn: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        lineHeight: '17px',
        border: '1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 55%, transparent)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent)',
      },
      badgeOff: {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        lineHeight: '17px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      hint: { fontSize: 12, lineHeight: '17px', color: 'var(--dsw-alias-label-secondary)' },
      notice: { fontSize: 12, lineHeight: '17px', color: 'var(--dsw-alias-label-primary)' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 2, minWidth: 320 },
      th: {
        textAlign: 'left',
        padding: '8px 10px',
        borderBottom: '1px solid var(--dsw-alias-border-l2)',
        fontWeight: 600,
        fontSize: 12,
        color: 'var(--dsw-alias-label-secondary)',
        whiteSpace: 'nowrap',
      },
      td: {
        padding: '8px 10px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        verticalAlign: 'top',
        lineHeight: 1.45,
        overflowWrap: 'anywhere',
      },
      tdLevel: {
        padding: '8px 10px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        verticalAlign: 'top',
        whiteSpace: 'nowrap',
        fontSize: 12.5,
      },
      hintNote: {
        fontSize: 12,
        lineHeight: 1.5,
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent)',
        color: 'var(--dsw-alias-label-secondary)',
      },
      error: { fontSize: 12, lineHeight: '17px', color: 'var(--dsw-alias-state-error-primary)' },
      /** Широкие блоки (таблица прав) не должны растягивать страницу. */
      scroll: { overflowX: 'auto', maxWidth: '100%', minWidth: 0, paddingBottom: 2 },
      list: {
        margin: 0,
        paddingLeft: 18,
        fontSize: 12.5,
        lineHeight: 1.6,
        color: 'var(--dsw-alias-label-secondary)',
      },
      step: { padding: '2px 0' },
      link: { color: 'var(--dsw-alias-brand-primary)', fontSize: 12.5, textDecoration: 'underline' },
    };

    /**
     * Mount the card and its credential control.
     * @param ctx - browser plugin context.
     */
    /** Содержимое карточки на странице своего плагина. */
    function DetailCard_dshgithubsafe(props) {
      const subject = props?.subject
      const packageName =
        subject?.kind === 'bundle' && typeof subject?.pkg?.name === 'string'
          ? subject.pkg.name
          : typeof subject?.id === 'string'
            ? subject.id
            : ''
      if (packageName !== 'dsh-github-safe') return null
      const content = GithubCard
      return typeof content === 'function' ? content(props) : content
    }

    function apply(ctx) {
  try {
    ctx.effect(() => {
      const tag = document.createElement('style')
      tag.textContent = [
        '.dsgh button{transition:background-color .12s ease,border-color .12s ease,color .12s ease}',
        '.dsgh button.is-secondary:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover) !important}',
        '.dsgh button.is-primary{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,transparent);color:var(--dsw-alias-brand-primary)}',
        '.dsgh button.is-primary:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 28%,transparent) !important}',
        '.dsgh button.is-danger{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 16%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 50%,transparent);color:var(--dsw-alias-state-error-primary)}',
        '.dsgh button.is-danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 24%,transparent) !important}',
        '.dsgh button:disabled{opacity:.55;cursor:default}',
        '.dsgh button:focus-visible,.dsgh input:focus-visible,.dsgh a:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
        '.dsgh table tbody tr:hover td{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 5%,transparent)}',
        '.dsgh ol li:hover{color:var(--dsw-alias-label-primary)}',
        '@media (max-width:900px){.dsgh{padding:20px 20px 36px !important}}',
        '@media (max-width:640px){.dsgh{padding:18px 16px 32px !important}.dsgh header{gap:10px}.dsgh button{max-width:100%}}',
      ].join('\n')
      document.head.appendChild(tag)
      return () => tag.remove()
    }, 'github-safe: styles')
  } catch (error) {
    console.error('[github-safe] стили недоступны:', error)
  }

      const t = ctx.locale.bind(NS);
      ctx.effect(() => ctx.locale.register(NS, { en, ru }), 'github-safe: card dictionaries');

      const api = ctx.remote.credentials;
      const listeners = new Set();
      let state = {
        configured: false,
        writable: true,
        loading: true,
        check: { phase: 'idle', message: '', remaining: null },
        update: { status: 'unknown', installed: null, latest: null, message: '' },
        updating: false,
        updateNotice: '',
      };

      /** Publish a new snapshot to every mounted card. */
      const setState = (next) => {
        state = { ...state, ...next };
        for (const listener of listeners) listener();
      };

      /**
       * Ask the host to prove the stored token against GitHub. The token never
       * crosses this boundary: the host resolves it and answers with a verdict.
       */
      const verify = async () => {
        setState({ check: { phase: 'checking', message: '', remaining: null } });
        try {
          const response = await fetch(VERIFY_PATH, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          });
          const payload = await response.json().catch(() => null);
          if (payload?.update !== undefined) setState({ update: payload.update });
          if (payload?.ok === true) {
            setState({ check: { phase: 'accepted', message: '', remaining: payload.remaining ?? null } });
            return;
          }
          const code = payload?.code;
          const phase = code === 'missing' ? 'missing' : code === 'rejected' ? 'rejected' : 'unreachable';
          setState({ check: { phase, message: payload?.message ?? '', remaining: null } });
        } catch (error) {
          setState({ check: { phase: 'unreachable', message: String(error?.message ?? ''), remaining: null } });
        }
      };

      /**
       * Ask the host to reinstall this plugin from GitHub. The host talks to the
       * plugin manager; the page only learns whether the work was scheduled.
       */
      const runUpdate = async () => {
        if (state.updating) return;
        setState({ updating: true, updateNotice: '' });
        try {
          const response = await fetch(UPDATE_PATH, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          });
          const payload = await response.json().catch(() => null);
          setState({
            updating: false,
            updateNotice: payload?.ok === true ? t('updateScheduled') : (payload?.message ?? t('updateNoop')),
          });
        } catch (error) {
          setState({ updating: false, updateNotice: String(error?.message ?? '') });
        }
      };

      /** Ask the host whether the reference holds a value (never reads it). */
      const refresh = async () => {
        try {
          const response = await api.describe([REF]);
          const view = response?.value?.[REF];
          setState({ configured: view?.configured === true, writable: view?.writable !== false, loading: false });
          if (view?.configured === true) {
            void verify();
          } else {
            setState({ check: { phase: 'missing', message: '', remaining: null } });
          }
        } catch {
          setState({ loading: false });
        }
      };

      /** Store the token; the literal is write-only across this boundary. */
      const save = async (value) => {
        const text = String(value ?? '').trim();
        if (text.length === 0) return false;
        try {
          await api.set(REF, text);
          await refresh();
          return state.configured;
        } catch {
          return false;
        }
      };

      /** Remove the stored token. */
      const clear = async () => {
        try {
          await api.unset(REF);
          await refresh();
          return true;
        } catch {
          return false;
        }
      };

      void refresh();
      ctx.effect(() => ctx.remote.$on('credentials/reference-updated', (ref) => {
        if (ref === REF) void refresh();
      }), 'github-safe: credential invalidation');

      /** Subscribe one card instance to the shared snapshot. */
      const useState_ = () => {
        const [, force] = React.useReducer((n) => n + 1, 0);
        React.useEffect(() => {
          listeners.add(force);
          return () => listeners.delete(force);
        }, []);
        return state;
      };

      /** The card body: summary view is one line, page view is the full control. */
      function GithubCard(props) {
        const view = props?.view;
        const snapshot = useState_();
        const [draft, setDraft] = React.useState('');
        const [busy, setBusy] = React.useState(false);
        const [notice, setNotice] = React.useState('');
        const [refreshing, setRefreshing] = React.useState(false);

        // The confirmation line is transient: a stale "saved" must not sit on
        // the card forever and read as the current state.
        React.useEffect(() => {
          if (notice.length === 0) return undefined;
          const timer = setTimeout(() => setNotice(''), 6000);
          return () => clearTimeout(timer);
        }, [notice]);

        if (view === 'summary') {
          const update = snapshot.update ?? { status: 'unknown' };
          return h(
            'span',
            { style: { display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 12.5, flexWrap: 'wrap' } },
            h('span', null, t('pageTitle')),
            h('span', { style: snapshot.configured ? S.badgeOn : S.badgeOff },
              snapshot.configured ? t('setBadge') : t('unsetBadge')),
            update.status === 'behind'
              ? h('span', { style: { ...S.chip, ...S.chipWarn } }, `${t('pageTitle')}: ${t('updateAvailable')}: ${short(update.installed)} → ${short(update.latest)}`)
              : null,
          );
        }

        // Manual refresh from the header: re-read the token state and check it with GitHub again.
        const reload = async () => {
          if (refreshing) return;
          setRefreshing(true);
          try {
            await refresh();
          } finally {
            setRefreshing(false);
          }
        };

        const submit = async () => {
          if (busy || draft.trim().length === 0) return;
          setBusy(true);
          setNotice('');
          const ok = await save(draft);
          setBusy(false);
          if (ok) {
            setDraft('');
            setNotice(t('saved'));
          } else {
            setNotice(t('failed'));
          }
        };

        const remove = async () => {
          if (busy) return;
          setBusy(true);
          setNotice('');
          const ok = await clear();
          setBusy(false);
          setNotice(ok ? t('cleared') : t('failed'));
        };

        const steps = [t('step1'), t('step2'), t('step3'), t('step4'), t('step5')];
        const update = snapshot.update ?? { status: 'unknown' };
        // Плашка/секция обновления называет плагин: без заголовка карточки
        // непонятно, чьё это обновление, особенно если открыто несколько плагинов.
        const updateHeading = update.status === 'behind'
          ? `${t('pageTitle')}: ${t('updateAvailable')}`
          : t('updateTitle');
        const updateText = update.status === 'behind'
          ? `${t('pageTitle')}: ${short(update.installed)} → ${short(update.latest)}`
          : update.status === 'current'
            ? `${t('updateCurrent')} (${short(update.installed)})`
            : update.status === 'error'
              ? t('updateUnknown')
              : '';

        const check = snapshot.check ?? { phase: 'idle' };
        const checkText = check.phase === 'checking' ? t('checking')
          : check.phase === 'accepted' ? t('accepted')
            : check.phase === 'rejected' ? t('rejected')
              : check.phase === 'missing' ? t('missing')
                : check.phase === 'unreachable' ? t('unreachable')
                  : '';
        const checkTone = check.phase === 'accepted' ? S.chipOk
          : check.phase === 'rejected' ? S.chipBad
            : check.phase === 'unreachable' ? S.chipWarn
              : {};
        const checkDot = check.phase === 'accepted' ? 'var(--dsw-alias-state-success-primary)'
          : check.phase === 'rejected' ? 'var(--dsw-alias-state-error-primary)'
            : check.phase === 'unreachable' ? 'var(--dsw-alias-state-warn-primary)'
              : 'var(--dsw-alias-label-tertiary)';
        const button = (kind, disabled) => ({ ...(S[kind] ?? S.secondary), ...(disabled ? S.off : {}) });

        return h(
          'div',
          { style: S.page, className: 'dsgh dsgh-card' },
          h(
            'header',
            { style: S.header },
            h('span', { style: S.logo, 'aria-hidden': true }, '🔐'),
            h(
              'div',
              { style: S.heading },
              h('h1', { style: S.h1 }, t('pageTitle')),
              h('p', { style: S.sub }, t('pageSubtitle')),
            ),
            h(
              'div',
              { style: S.actions },
              h(
                'span',
                { style: S.chip, role: 'status' },
                h('span', {
                  style: S.dot(snapshot.configured
                    ? 'var(--dsw-alias-state-success-primary)'
                    : 'var(--dsw-alias-state-error-primary)'),
                }),
                snapshot.configured ? t('setBadge') : t('unsetBadge'),
              ),
              h('button', {
                type: 'button',
                className: 'is-secondary',
                style: { ...S.secondary, ...S.small, ...(refreshing ? S.off : {}) },
                disabled: refreshing,
                onClick: () => void reload(),
              }, refreshing ? t('refreshing') : t('refresh')),
            ),
          ),
          h(
            'section',
            { style: S.card, 'aria-label': t('tokenSection') },
            h('h2', { style: S.sectionTitle }, h('span', { style: S.accent }), t('tokenSection')),
            h('label', { style: S.label, htmlFor: 'github-safe-token' }, t('tokenLabel')),
            h(
              'div',
              { style: S.row },
              h('input', {
                id: 'github-safe-token',
                type: 'password',
                autoComplete: 'off',
                spellCheck: false,
                placeholder: snapshot.configured ? t('placeholderSet') : t('placeholderUnset'),
                value: draft,
                disabled: busy || !snapshot.writable,
                style: S.input,
                onChange: (event) => setDraft(event.target.value),
                onKeyDown: (event) => { if (event.key === 'Enter') void submit(); },
              }),
              h('button', {
                type: 'button',
                className: 'is-primary',
                style: button('primary', busy || draft.trim().length === 0),
                disabled: busy || draft.trim().length === 0,
                onClick: () => void submit(),
              }, busy ? t('saving') : t('save')),
              snapshot.configured
                ? h('button', {
                    type: 'button',
                    className: 'is-danger',
                    style: button('danger', busy),
                    disabled: busy,
                    onClick: () => void remove(),
                  }, t('clear'))
                : null,
            ),
            h('span', { style: S.hint }, t('storedIn')),
            h(
              'div',
              { style: S.row },
              checkText.length === 0
                ? null
                : h(
                    'span',
                    { style: { ...S.chip, ...checkTone }, role: 'status' },
                    h('span', { style: S.dot(checkDot) }),
                    checkText,
                  ),
              snapshot.check?.phase === 'accepted' && snapshot.check?.remaining !== null
                ? h('span', { style: S.hint }, `${t('quota')} ${snapshot.check.remaining}`)
                : null,
              snapshot.check?.phase === 'checking'
                ? null
                : h('button', {
                    type: 'button',
                    className: 'is-secondary',
                    style: button('secondary', busy),
                    disabled: busy,
                    onClick: () => void verify(),
                  }, t('again')),
            ),
            snapshot.writable ? null : h('span', { style: S.error }, t('readonly')),
            notice.length > 0 ? h('span', { style: S.notice }, notice) : null,
          ),
          h(
            'section',
            { style: S.card, 'aria-label': updateHeading },
            h('h2', { style: S.sectionTitle }, h('span', { style: S.accent }), updateHeading),
            h(
              'div',
              { style: S.row },
              updateText.length === 0
                ? h(
                    'span',
                    { style: S.chip, role: 'status' },
                    h('span', { style: S.dot('var(--dsw-alias-label-tertiary)') }),
                    `${t('updateTitle')}: ${t('updateUnknown')}`,
                  )
                : h(
                    'span',
                    { style: { ...S.chip, ...(update.status === 'behind' ? S.chipWarn : {}) }, role: 'status' },
                    update.status === 'behind'
                      ? h('span', { style: S.dot('var(--dsw-alias-state-warn-primary)') })
                      : h('span', { style: S.dot('var(--dsw-alias-state-success-primary)') }),
                    updateText,
                  ),
              snapshot.update?.status === 'behind'
                ? h('button', {
                    type: 'button',
                    className: 'is-secondary',
                    style: button('secondary', snapshot.updating),
                    disabled: snapshot.updating,
                    onClick: () => void runUpdate(),
                  }, snapshot.updating ? t('updateStarting') : t('updateButton'))
                : null,
            ),
            snapshot.updateNotice.length > 0 ? h('span', { style: S.hint }, snapshot.updateNotice) : null,
          ),
          h(
            'section',
            { style: S.card, 'aria-label': t('howTitle') },
            h('h2', { style: S.sectionTitle }, h('span', { style: S.accent }), t('howTitle')),
            h('ol', { style: S.list }, steps.map((step, index) => h('li', { key: index, style: S.step }, step))),
            h('h3', { style: S.subTitle }, h('span', { style: S.accent }), t('permTitle')),
            h(
              'div',
              { style: S.scroll },
              h(
                'table',
                { style: S.table },
              h(
                'thead',
                null,
                h(
                  'tr',
                  null,
                  h('th', { style: S.th }, t('permColPermission')),
                  h('th', { style: S.th }, t('permColLevel')),
                  h('th', { style: S.th }, t('permColUse')),
                ),
              ),
              h(
                'tbody',
                null,
                [
                  ['Metadata', 'Read', t('permMetadataUse')],
                  ['Contents', 'Read and write', t('permContentsUse')],
                  ['Issues', 'Read and write', t('permIssuesUse')],
                  ['Pull requests', 'Read and write', t('permPullsUse')],
                  ['Commit statuses', 'Read', t('permStatusesUse')],
                  ['Checks', 'Read', t('permChecksUse')],
                  ['Administration', 'Read and write', t('permAdminUse')],
                ].map(([name, level, use], index) =>
                  h(
                    'tr',
                    { key: index },
                    h('td', { style: S.td }, h('code', null, name)),
                    h('td', { style: S.tdLevel }, level),
                    h('td', { style: S.td }, use),
                  ),
                ),
              ),
            ),
            ),
            h('span', { style: S.hint }, t('permNote')),
            h('span', { style: S.hint }, t('permAccessNote')),
            h('span', { style: S.hintNote }, t('noteExisting')),
            h('a', {
              style: S.link,
              href: 'https://github.com/settings/personal-access-tokens/new',
              target: '_blank',
              rel: 'noreferrer noopener',
            }, t('openGithub')),
          ),
          h(
            'section',
            { style: S.card, 'aria-label': t('warnTitle') },
            h('h2', { style: S.sectionTitle }, h('span', { style: S.accent }), t('warnTitle')),
            h('span', { style: S.hint }, t('warnBody')),
          ),
          h(
            'section',
            { style: S.card, 'aria-label': t('policyTitle') },
            h('h2', { style: S.sectionTitle }, h('span', { style: S.accent }), t('policyTitle')),
            h('span', { style: S.hint }, t('policyBody')),
          ),
        );
      }

            try {
        ctx.slots.inject('plugins.detail.section', () =>
          ctx.slots.register(
            {
              name: 'plugins.detail.section',
              id: 'dsh-github-safe-detail',
              order: 45,
              locale: NS,
            },
            (props) => {
              const subject = props?.subject
              const packageName =
                subject?.kind === 'bundle' && typeof subject?.pkg?.name === 'string'
                  ? subject.pkg.name
                  : typeof subject?.id === 'string'
                    ? subject.id
                    : ''
              if (packageName !== 'dsh-github-safe') return null
              return h(GithubCard, props)
            },
          ),
        )
      } catch (error) {
        console.error('[dsh-github-safe] секция страницы недоступна:', error)
      }
    }

    exports.apply = apply;
    exports.inject = ['slots', 'locale', 'remote', 'remote.credentials'];
    exports.NS = NS;
    return module.exports;
  },
});
