/**
 * Host half of `@local/github-safe`.
 *
 * Registers nine GitHub tools and one approval gate. The plugin has no
 * configuration, no dependencies, no filesystem access, no child processes, and
 * exactly one network origin (`https://api.github.com`). The token comes from
 * the DSH credential store (`refs.GITHUB_TOKEN`) and is resolved per operation.
 *
 * Every write tool is intercepted by `tools/pre-execute`: the host asks the
 * human and the call proceeds only on an explicit allow. Reads are not gated
 * because they cannot change anything.
 */

import { createClient, GithubError } from './lib/http.js'
import { createTools } from './lib/tools.js'

export const name = 'github-safe'

/** Services required before the tools can be registered. */
export const inject = ['tools', 'credentials', 'connection', 'systemPrompt']

/** Route the settings card calls to prove the stored token works. */
const VERIFY_PATH = '/api/github-safe/verify'

/** Prompt variable carrying the live token state into every session. */
const TOKEN_VARIABLE = 'github_token_state'

/**
 * Prompt section every session receives: it tells the model that this Harness
 * has a GitHub integration, what it may and may not do, and what to do when no
 * token is stored yet.
 */
const PROMPT_SECTION = `## GitHub

This Harness has a GitHub integration installed: plugin \`github-safe\`, tools named \`github_*\`.

- \`github_status\` reports whether a token is stored, the remaining quota and the exact endpoint allowlist. Call it before a GitHub task.
- Reads, no approval: \`github_repo\`, \`github_file\`, \`github_issue\`, \`github_review\`, \`github_search\`.
- Writes, each one pauses for the human: \`github_repo_create\` (a new repository in the token owner's own account — the only exception inside \`/user\`, it creates and reads nothing), \`github_issue_write\`, \`github_pr_write\`, \`github_file_write\`, \`github_push_files\` (many files, one commit), \`github_release_create\`. A write counts as done only after the call returns; a denial means nothing changed on GitHub.
- The plugin reaches api.github.com and repository content only. It cannot delete anything and cannot touch the account, profile, organisation, collaborators, webhooks, secrets or repository settings. If the user asks for such an action, say plainly that the plugin does not expose it — do not offer a workaround.
- Never use \`gh\`, \`curl\`, \`git push\` with credentials, or environment variables instead of these tools.
- Stored token right now: {{${TOKEN_VARIABLE}}}.

If the state says \`not configured\`, or \`github_status\` reports a missing token, stop before doing anything else: tell the user in their language that no GitHub token is stored yet and that it is entered once in Settings → Plugins → GitHub → "Personal access token" (stored as \`refs.GITHUB_TOKEN\` in the DSH credential store), then wait for them.`

/** Tools that change state on GitHub and therefore ask first. */
const WRITE_TOOLS = new Set([
  'github_repo_create',
  'github_issue_write',
  'github_pr_write',
  'github_file_write',
  'github_push_files',
  'github_release_create',
])

/**
 * Human-readable description of one pending write, used as the approval prompt.
 * @param tool - tool name being intercepted.
 * @param args - frozen tool arguments.
 * @returns the reason string.
 */
function approvalReason(tool, args) {
  const target = `${args?.owner ?? '?'}/${args?.repo ?? '?'}`
  const number = args?.number !== undefined ? `#${args.number}` : ''
  if (tool === 'github_repo_create') {
    return `создать репозиторий ${String(args?.name ?? '?')} в своём аккаунте (${args?.private === false ? 'публичный' : 'приватный'})`
  }
  if (tool === 'github_issue_write') {
    const action = String(args?.action ?? '?')
    if (action === 'create') return `создать issue в ${target}: "${String(args?.title ?? '').slice(0, 80)}"`
    if (action === 'comment') return `прокомментировать issue ${number} в ${target} (${String(args?.body ?? '').length} символов)`
    if (action === 'close' || action === 'reopen') return `${action === 'close' ? 'закрыть' : 'переоткрыть'} issue ${number} в ${target}`
    return `изменить issue ${number} в ${target}`
  }
  if (tool === 'github_pr_write') {
    const action = String(args?.action ?? '?')
    if (action === 'create') return `создать pull request в ${target}: "${String(args?.title ?? '').slice(0, 80)}" (${args?.head} → ${args?.base})`
    if (action === 'merge') return `смёржить pull request ${number} в ${target} способом ${args?.mergeMethod ?? 'merge'}`
    if (action === 'review') return `отправить ревью ${args?.event ?? 'COMMENT'} для pull request ${number} в ${target}`
    if (action === 'comment') return `прокомментировать pull request ${number} в ${target}`
    return `изменить pull request ${number} в ${target}`
  }
  if (tool === 'github_file_write') {
    return `закоммитить файл ${String(args?.path ?? '?')} в ${target} (${String(args?.content ?? '').length} символов)`
  }
  if (tool === 'github_push_files') {
    const count = Array.isArray(args?.files) ? args.files.length : 0
    return `закоммитить ${count} файлов в ${target} одним коммитом ("${String(args?.message ?? '').slice(0, 70)}")`
  }
  if (tool === 'github_release_create') {
    return `создать релиз ${String(args?.tag ?? '?')} в ${target}${args?.draft === true ? ' (черновик)' : ''}`
  }
  return `выполнить запись в GitHub: ${tool}`
}

/**
 * Mount the tools and the write gate.
 * @param ctx - owning plugin context.
 */
export function apply(ctx) {
  const client = createClient(ctx)

  // Live token state for the prompt: resolved here, refreshed on every
  // credential change, so a session that starts after the token is stored sees
  // the new value without a restart.
  let tokenState = 'unknown'
  const refreshTokenState = async () => {
    try {
      const hit = await ctx.credentials.resolve('GITHUB_TOKEN')
      tokenState = hit !== undefined && typeof hit.value === 'string' && hit.value.length > 0
        ? 'configured'
        : 'not configured'
    } catch {
      tokenState = 'unknown'
    }
  }
  void refreshTokenState()
  ctx.effect(
    () =>
      ctx.on('credentials/reference-updated', (ref) => {
        if (ref === 'GITHUB_TOKEN') void refreshTokenState()
      }),
    'github-safe: token state tracking',
  )

  // Every session learns that GitHub exists here, what the boundary is, and
  // what to do when the token is missing — without the user explaining it.
  ctx.systemPrompt.variable(TOKEN_VARIABLE, () => tokenState)
  ctx.systemPrompt.section({ name: 'tool:github-safe', order: 900, text: PROMPT_SECTION })

  for (const tool of createTools(client)) {
    ctx.tools.register(tool)
  }

  // Registered as an effect: unloading the plugin removes the listener.
  ctx.effect(
    () =>
      ctx.on('tools/pre-execute', async (exec, next) => {
        if (!WRITE_TOOLS.has(exec.name)) return next()
        return { kind: 'ask', reason: `GitHub (плагин github-safe): ${approvalReason(exec.name, exec.arguments)}` }
      }),
    'github-safe: write approval gate',
  )

  // The settings card asks the host — never the browser — whether the stored
  // token is actually accepted, because the token never leaves the host.
  ctx.connection.fetch.register({
    path: VERIFY_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: () => verifyToken(client),
  })
}

/**
 * Prove the stored token against GitHub with one quota request.
 * @param client - the plugin's guarded client.
 * @returns a JSON answer carrying the verdict; the transport status stays 200
 *   so the card reads a verdict rather than a transport failure.
 */
async function verifyToken(client) {
  try {
    const status = await client.status()
    if (status.ok) {
      return json({
        ok: true,
        code: 'accepted',
        remaining: status.rateLimit.remaining,
        resetAt: status.rateLimit.resetAt,
      })
    }
    if (status.status === 401) {
      return json({ ok: false, code: 'rejected', message: 'GitHub отклонил токен (401): проверьте срок действия и права.' })
    }
    return json({ ok: false, code: 'unexpected', message: `GitHub ответил ${status.status}.` })
  } catch (error) {
    if (error instanceof GithubError) {
      if (error.code === 'no-token') return json({ ok: false, code: 'missing', message: error.message })
      if (error.status === 401) return json({ ok: false, code: 'rejected', message: 'GitHub отклонил токен (401): проверьте срок действия и права.' })
      return json({ ok: false, code: 'network', message: error.message })
    }
    return json({ ok: false, code: 'network', message: 'Не удалось связаться с GitHub.' })
  }
}

/**
 * Build one JSON response.
 * @param value - body to serialise.
 * @param status - HTTP status; 200 by default.
 * @returns the response.
 */
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
