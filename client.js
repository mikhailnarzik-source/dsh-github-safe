/**
 * Browser half of `@local/github-safe`.
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
  id: '@local/github-safe',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const React = require('react');
    const h = React.createElement;

    const NS = 'githubSafe';
    const REF = 'GITHUB_TOKEN';
    const VERIFY_PATH = '/api/github-safe/verify';

    const en = {
      title: 'GitHub',
      summarySet: 'Token configured',
      summaryUnset: 'Token not configured',
      pageTitle: 'GitHub access',
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
      storedIn: 'Stored in the DSH credential store (refs.GITHUB_TOKEN), not in the plugin configuration.',
      readonly: 'This deployment stores credentials read-only.',
      setBadge: 'configured',
      unsetBadge: 'not configured',
      howTitle: 'How to create the token',
      step1: 'Open GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.',
      step2: 'Repository access: Only select repositories — pick exactly the repositories you want the agent to work with.',
      step3: 'Expiration: 90 days (renew instead of creating a never-expiring token).',
      step4: 'Permissions: Metadata → Read (required), Contents → Read and write, Issues → Read and write, Pull requests → Read and write, Commit statuses → Read.',
      step5: 'Generate the token and paste the github_pat_… value into the field above.',
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
      storedIn: 'Хранится в хранилище секретов DSH (refs.GITHUB_TOKEN), а не в конфигурации плагина.',
      readonly: 'В этом окружении хранилище секретов доступно только для чтения.',
      setBadge: 'настроен',
      unsetBadge: 'не настроен',
      howTitle: 'Как создать токен',
      step1: 'GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.',
      step2: 'Repository access: Only select repositories — выбери ровно те репозитории, с которыми должен работать агент.',
      step3: 'Expiration: 90 дней (лучше продлевать, чем создавать бессрочный токен).',
      step4: 'Permissions: Metadata → Read (обязательно), Contents → Read and write, Issues → Read and write, Pull requests → Read and write, Commit statuses → Read.',
      step5: 'Сгенерируй токен и вставь значение github_pat_… в поле выше.',
      noteExisting: 'Токен уже создан с Contents → Read? Открой его, поменяй Repository permissions → Contents → Read and write и сохрани. Сам токен при этом не меняется — перевыпускать не нужно, плагин сразу увидит новые права.',
      warnTitle: 'Не выдавай',
      warnBody: 'Administration, Secrets, Collaborators, Actions (write), Webhooks, Deploy keys. У плагина нет эндпоинтов, где они нужны — он не может менять настройки аккаунта, участников или что-то удалять.',
      openGithub: 'Создать токен на GitHub',
      policyTitle: 'Что плагину разрешено',
      policyBody: 'Allowlist, запрет по умолчанию: только содержимое репозиториев. Чтение: репозиторий, ветки, файлы, issue, pull request, проверки, релизы, поиск. Запись (каждый раз с подтверждением): создать/прокомментировать/закрыть issue, создать/смёржить/отревьювить PR, закоммитить файл, создать релиз. Никакого DELETE, никаких /user, /orgs, collaborators.',
    };

    /** Element styling kept inline so the card follows the host theme without importing CSS. */
    const S = {
      card: { display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' },
      row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      label: { fontSize: 13, fontWeight: 600 },
      input: {
        flex: '1 1 260px',
        minWidth: 220,
        padding: '7px 10px',
        borderRadius: 8,
        border: '1px solid rgba(128,128,128,0.45)',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        fontSize: 13,
      },
      button: {
        padding: '7px 14px',
        borderRadius: 8,
        border: '1px solid rgba(128,128,128,0.45)',
        background: 'rgba(128,128,128,0.12)',
        color: 'inherit',
        font: 'inherit',
        fontSize: 13,
        cursor: 'pointer',
      },
      buttonOff: { opacity: 0.5, cursor: 'default' },
      badgeOn: { fontSize: 12, padding: '2px 8px', borderRadius: 999, background: 'rgba(46,160,67,0.18)', border: '1px solid rgba(46,160,67,0.45)' },
      badgeOff: { fontSize: 12, padding: '2px 8px', borderRadius: 999, background: 'rgba(128,128,128,0.14)', border: '1px solid rgba(128,128,128,0.35)' },
      statusOk: { fontSize: 12.5, padding: '3px 9px', borderRadius: 999, background: 'rgba(46,160,67,0.16)', border: '1px solid rgba(46,160,67,0.5)' },
      statusBad: { fontSize: 12.5, padding: '3px 9px', borderRadius: 999, background: 'rgba(209,36,47,0.14)', border: '1px solid rgba(209,36,47,0.5)' },
      statusWait: { fontSize: 12.5, padding: '3px 9px', borderRadius: 999, background: 'rgba(200,140,0,0.16)', border: '1px solid rgba(200,140,0,0.5)' },
      statusNeutral: { fontSize: 12.5, padding: '3px 9px', borderRadius: 999, background: 'rgba(128,128,128,0.14)', border: '1px solid rgba(128,128,128,0.4)' },
      hint: { fontSize: 12, opacity: 0.75, lineHeight: 1.45 },
      hintNote: { fontSize: 12, lineHeight: 1.5, padding: '8px 10px', borderRadius: 8, background: 'rgba(200,140,0,0.12)', border: '1px solid rgba(200,140,0,0.35)' },
      error: { fontSize: 12, color: '#d1242f' },
      section: { display: 'flex', flexDirection: 'column', gap: 6 },
      title: { fontSize: 13, fontWeight: 600, marginTop: 4 },
      list: { margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55, opacity: 0.9 },
      link: { color: 'inherit', fontSize: 12.5, textDecoration: 'underline' },
    };

    /**
     * Mount the card and its credential control.
     * @param ctx - browser plugin context.
     */
    function apply(ctx) {
      const t = ctx.locale.bind(NS);
      ctx.effect(() => ctx.locale.register(NS, { en, ru }), 'github-safe: card dictionaries');

      const api = ctx.remote.credentials;
      const listeners = new Set();
      let state = {
        configured: false,
        writable: true,
        loading: true,
        check: { phase: 'idle', message: '', remaining: null },
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

        // The confirmation line is transient: a stale "saved" must not sit on
        // the card forever and read as the current state.
        React.useEffect(() => {
          if (notice.length === 0) return undefined;
          const timer = setTimeout(() => setNotice(''), 6000);
          return () => clearTimeout(timer);
        }, [notice]);

        if (view === 'summary') {
          return h(
            'span',
            { style: { display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 12.5 } },
            h('span', null, t('pageTitle')),
            h('span', { style: snapshot.configured ? S.badgeOn : S.badgeOff },
              snapshot.configured ? t('setBadge') : t('unsetBadge')),
          );
        }

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

        return h(
          'div',
          { style: S.card },
          h(
            'div',
            { style: S.section },
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
                style: { ...S.button, ...(busy || draft.trim().length === 0 ? S.buttonOff : {}) },
                disabled: busy || draft.trim().length === 0,
                onClick: () => void submit(),
              }, busy ? t('saving') : t('save')),
              snapshot.configured
                ? h('button', {
                    type: 'button',
                    style: { ...S.button, ...(busy ? S.buttonOff : {}) },
                    disabled: busy,
                    onClick: () => void remove(),
                  }, t('clear'))
                : null,
            ),
            h('span', { style: S.hint }, t('storedIn')),
            h(
              'div',
              { style: S.row },
              (() => {
                const check = snapshot.check ?? { phase: 'idle' };
                const text = check.phase === 'checking' ? t('checking')
                  : check.phase === 'accepted' ? t('accepted')
                    : check.phase === 'rejected' ? t('rejected')
                      : check.phase === 'missing' ? t('missing')
                        : check.phase === 'unreachable' ? t('unreachable')
                          : '';
                const style = check.phase === 'accepted' ? S.statusOk
                  : check.phase === 'rejected' ? S.statusBad
                    : check.phase === 'unreachable' ? S.statusWait
                      : S.statusNeutral;
                return text.length === 0 ? null : h('span', { style, role: 'status' }, text);
              })(),
              snapshot.check?.phase === 'accepted' && snapshot.check?.remaining !== null
                ? h('span', { style: S.hint }, `${t('quota')} ${snapshot.check.remaining}`)
                : null,
              snapshot.check?.phase === 'checking'
                ? null
                : h('button', {
                    type: 'button',
                    style: { ...S.button, ...(busy ? S.buttonOff : {}) },
                    disabled: busy,
                    onClick: () => void verify(),
                  }, t('again')),
            ),
            snapshot.writable ? null : h('span', { style: S.error }, t('readonly')),
            notice.length > 0 ? h('span', { style: S.hint }, notice) : null,
          ),
          h(
            'div',
            { style: S.section },
            h('span', { style: S.title }, t('howTitle')),
            h('ul', { style: S.list }, steps.map((step, index) => h('li', { key: index }, step))),
            h('span', { style: S.hintNote }, t('noteExisting')),
            h('a', {
              style: S.link,
              href: 'https://github.com/settings/personal-access-tokens/new',
              target: '_blank',
              rel: 'noreferrer noopener',
            }, t('openGithub')),
          ),
          h(
            'div',
            { style: S.section },
            h('span', { style: S.title }, t('warnTitle')),
            h('span', { style: S.hint }, t('warnBody')),
          ),
          h(
            'div',
            { style: S.section },
            h('span', { style: S.title }, t('policyTitle')),
            h('span', { style: S.hint }, t('policyBody')),
          ),
        );
      }

      ctx.slots.inject('plugins.item', () => ctx.slots.register({
        name: 'plugins.item',
        id: '@local/github-safe',
        order: 50,
        label: () => t('title'),
        locale: NS,
      }, GithubCard));
    }

    exports.apply = apply;
    exports.inject = ['slots', 'locale', 'remote', 'remote.credentials'];
    exports.NS = NS;
    return module.exports;
  },
});
