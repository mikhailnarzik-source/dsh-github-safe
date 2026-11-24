import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Minimal React stand-in: hooks return their initial values and do nothing. */
const fakeReact = {
  createElement: (type, props, ...children) => ({
    type,
    props: {
      ...(props ?? {}),
      children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children,
    },
  }),
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useReducer: (_reducer, initial) => [initial, () => {}],
  useRef: initial => ({ current: initial }),
  useEffect: () => {},
  useCallback: callback => callback,
  useMemo: factory => factory(),
}

/** Render function components down to plain host elements. */
function render(node) {
  if (node === null || node === undefined) return node
  if (Array.isArray(node)) return node.map(render)
  if (typeof node === 'object' && typeof node.type === 'function') return render(node.type(node.props ?? {}))
  if (typeof node === 'object' && node.props !== undefined) {
    return { ...node, props: { ...node.props, children: render(node.props.children) } }
  }
  return node
}

/** Collect every string in a React element tree. */
function texts(node, found = []) {
  if (node === null || node === undefined) return found
  if (typeof node === 'string' || typeof node === 'number') {
    found.push(String(node))
    return found
  }
  if (Array.isArray(node)) {
    for (const item of node) texts(item, found)
    return found
  }
  if (typeof node === 'object' && node.props !== undefined) texts(node.props.children, found)
  return found
}

/** Collect every React element (object with a type) in the tree. */
function elements(node, found = []) {
  if (node === null || node === undefined) return found
  if (Array.isArray(node)) {
    for (const item of node) elements(item, found)
    return found
  }
  if (typeof node === 'object' && node.type !== undefined) {
    found.push(node)
    elements(node.props?.children, found)
  }
  return found
}

/** Load `client.js` the way the browser module loader does. */
async function loadClient(options = {}) {
  const configured = options.configured === true
  const update = options.update ?? null
  const source = await readFile(join(ROOT, 'client.js'), 'utf8')
  const captured = {}
  const styles = []
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(options) {
          captured.options = options
        },
      },
    },
    document: {
      createElement: () => {
        const node = { textContent: '', remove() {} }
        return node
      },
      head: { appendChild: node => styles.push(node.textContent) },
      body: { backgroundColor: 'rgb(20, 20, 20)' },
      visibilityState: 'visible',
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    getComputedStyle: () => ({ backgroundColor: 'rgb(20, 20, 20)' }),
    console: { error: () => {}, warn: () => {}, log: () => {} },
    fetch: async (url) => {
      // Проверка токена отвечает и состоянием обновления — как настоящий Host.
      if (configured && String(url) === '/api/github-safe/verify') {
        return { ok: true, json: async () => ({ ok: true, remaining: 42, update }) }
      }
      return { ok: true, json: async () => ({}) }
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
  }
  vm.runInNewContext(source, sandbox, { filename: 'client.js' })
  assert.ok(captured.options !== undefined, 'ModuleLoader.load вызван')
  assert.equal(captured.options.id, 'dsh-github-safe')

  const module = captured.options.factory(name => {
    if (name === 'react') return fakeReact
    throw new Error(`неожиданный модуль ${name}`)
  })
  assert.equal(typeof module.apply, 'function')
  assert.deepEqual([...module.inject], ['slots', 'locale', 'remote', 'remote.credentials'])

  const locales = []
  const registered = []
  const injected = []
  const ctx = {
    effect: callback => {
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    locale: {
      register(namespace, dictionaries) {
        locales.push({ namespace, dictionaries })
      },
      bind(namespace) {
        return key => `${namespace}.${key}`
      },
    },
    slots: {
      inject(name, callback) {
        injected.push(name)
        return callback()
      },
      register(options, component) {
        registered.push({ options, component })
        return () => {}
      },
    },
    remote: {
      credentials: {
        describe: async () => ({ value: { GITHUB_TOKEN: { configured, writable: true } } }),
        set: async () => {},
        unset: async () => {},
      },
      $on: () => () => {},
    },
  }
  module.apply(ctx)
  // `refresh()` асинхронный: ждём, пока проверка токена отдаст состояние обновления.
  if (configured) await new Promise(resolve => setTimeout(resolve, 20))
  return { module, locales, registered, injected, styles }
}

test('client.js: словари en и ru совпадают по ключам', async () => {
  const { module, locales } = await loadClient()
  assert.equal(locales.length, 1)
  const { namespace, dictionaries } = locales[0]
  assert.equal(namespace, 'githubSafe')
  assert.equal(dictionaries.en.pageTitle, 'GitHub access')
  assert.equal(dictionaries.ru.pageTitle, 'Доступ к GitHub')
  const enKeys = Object.keys(dictionaries.en).sort()
  const ruKeys = Object.keys(dictionaries.ru).sort()
  assert.deepEqual(enKeys, ruKeys, 'словари описывают одни и те же строки')

  const source = await readFile(join(ROOT, 'client.js'), 'utf8')
  const used = new Set([...source.matchAll(/\bt\('([A-Za-z0-9_]+)'\)/g)].map(match => match[1]))
  assert.ok(used.size > 30, `строк используется много: ${used.size}`)
  for (const key of used) {
    assert.ok(enKeys.includes(key), `en: есть ключ ${key}`)
    assert.ok(ruKeys.includes(key), `ru: есть ключ ${key}`)
  }
  assert.equal(module.NS, 'githubSafe')
})

test('client.js: секция регистрируется только для своего плагина', async () => {
  const { injected, registered } = await loadClient()
  assert.ok(injected.includes('plugins.detail.section'))
  assert.equal(registered.length, 1)
  const { options, component } = registered[0]
  assert.equal(options.name, 'plugins.detail.section')
  assert.equal(options.id, 'dsh-github-safe-detail')
  assert.equal(options.locale, 'githubSafe')
  assert.equal(component({ subject: { kind: 'bundle', pkg: { name: 'dsh-other' } } }), null)
  assert.equal(component({ subject: { id: 'dsh-other' } }), null)
})

test('client.js: сводка в списке плагинов рисуется без ошибок', async () => {
  const { registered } = await loadClient()
  const { component } = registered[0]
  const element = component({ subject: { kind: 'bundle', pkg: { name: 'dsh-github-safe' } }, view: 'summary' })
  assert.notEqual(element, null)
  const labels = texts(render(element)).join(' ')
  assert.match(labels, /githubSafe\.pageTitle/)
  assert.match(labels, /githubSafe\.unsetBadge/)
})

test('client.js: плашка обновления называет плагин и не теряет кнопку', async () => {
  const { registered, locales } = await loadClient({
    configured: true,
    update: { status: 'behind', installed: 'old1234', latest: 'new5678', message: '' },
  })
  // Локаль: название плагина и фраза «доступно обновление» дают точный заголовок.
  const ru = locales[0].dictionaries.ru
  assert.equal(`${ru.pageTitle}: ${ru.updateAvailable}`, 'Доступ к GitHub: доступно обновление')

  const { component } = registered[0]
  const subject = { subject: { kind: 'bundle', pkg: { name: 'dsh-github-safe' } } }

  // Сводка в списке плагинов: чип называет плагин и показывает обе версии.
  const summary = texts(render(component({ ...subject, view: 'summary' }))).join(' ')
  assert.match(summary, /githubSafe\.pageTitle: githubSafe\.updateAvailable: old1234 → new5678/)

  // Карточка: заголовок секции — «<Название>: доступно обновление», чип — версии.
  const tree = render(component(subject))
  const all = elements(tree)
  const heading = all.find(node => node.type === 'h2' && texts(node).join('') === 'githubSafe.pageTitle: githubSafe.updateAvailable')
  assert.ok(heading, 'заголовок обновления содержит название плагина')
  const card = all.find(node => node.type === 'section' && node.props?.['aria-label'] === 'githubSafe.pageTitle: githubSafe.updateAvailable')
  assert.ok(card, 'секция обновления подписана названием плагина')
  const status = all.find(node => node.props?.role === 'status'
    && texts(node).join('') === 'githubSafe.pageTitle: old1234 → new5678')
  assert.ok(status, 'строка версий с названием плагина')
  const updateButton = all.find(node => node.type === 'button' && texts(node).join('') === 'githubSafe.updateButton')
  assert.ok(updateButton, 'кнопка «Обновить» на месте')
  assert.equal(updateButton.props.disabled, false, 'кнопка активна')
  assert.equal(typeof updateButton.props.onClick, 'function', 'обновление подключено')
})

test('client.js: страница оформлена по единому стилю', async () => {
  const { registered, styles } = await loadClient()
  const { component } = registered[0]
  const element = component({ subject: { kind: 'bundle', pkg: { name: 'dsh-github-safe' } } })
  assert.notEqual(element, null)
  const tree = render(element)
  const all = elements(tree)

  // Центрированный контейнер 960.
  assert.equal(tree.props.className, 'dsgh dsgh-card')
  assert.equal(tree.props.style.maxWidth, 960)
  assert.equal(tree.props.style.margin, '0 auto')
  assert.equal(tree.props.style.padding, '24px 28px 40px')
  assert.equal(tree.props.style.boxSizing, 'border-box')

  // Шапка: иконка-квадрат 52 🔐, заголовок 20/600, подзаголовок, чип и «Обновить».
  const header = all.find(node => node.type === 'header')
  assert.ok(header, 'шапка страницы')
  const logo = all.find(node => node.props?.style?.width === 52 && node.props?.style?.height === 52)
  assert.ok(logo, 'иконка 52×52 в шапке')
  assert.equal(logo.props.style.borderRadius, 14)
  assert.equal(texts(logo).join(''), '🔐')
  const heading = all.find(node => node.type === 'h1')
  assert.equal(texts(heading).join(''), 'githubSafe.pageTitle')
  assert.equal(heading.props.style.fontSize, 20)
  assert.equal(heading.props.style.fontWeight, 600)
  const subtitle = all.find(node => node.props?.style?.fontSize === 12.5 && node.props?.style?.WebkitLineClamp === 2)
  assert.ok(subtitle, 'подзаголовок в две строки максимум')
  assert.match(texts(subtitle).join(''), /githubSafe\.pageSubtitle/)

  const chip = all.find(node => node.props?.role === 'status' && texts(node).join('') === 'githubSafe.unsetBadge')
  assert.ok(chip, 'статус-чип токена')
  assert.ok(all.some(node => node.props?.style?.width === 6 && node.props?.style?.borderRadius === '50%'), 'точка в чипе')

  const refresh = all.find(node => node.type === 'button' && texts(node).join('') === 'githubSafe.refresh')
  assert.ok(refresh, 'кнопка «Обновить»')
  assert.equal(typeof refresh.props.onClick, 'function', 'обновление подключено')
  assert.equal(refresh.props.style.height, 32, 'маленькая secondary-кнопка в шапке')

  // Карточки-секции с акцентной полоской.
  const cards = all.filter(node => node.type === 'section' && node.props?.style?.borderRadius === 14)
  assert.ok(cards.length >= 5, `карточек-секций: ${cards.length}`)
  for (const card of cards) {
    const accent = elements(card).some(node => node.props?.style?.width === 3 && node.props?.style?.height === 14)
    assert.ok(accent, 'у карточки есть акцентная полоска у заголовка')
  }

  // Вся функциональность на месте: токен, сохранение, удаление, проверка.
  const input = all.find(node => node.props?.id === 'github-safe-token')
  assert.ok(input, 'поле токена')
  assert.equal(input.props.type, 'password')
  assert.equal(typeof input.props.onChange, 'function', 'ввод токена работает')
  assert.equal(typeof input.props.onKeyDown, 'function')
  assert.ok(input.props.style.height === 34 && input.props.style.borderRadius === 9, 'поле 34/9')

  const save = all.find(node => node.type === 'button' && texts(node).join('') === 'githubSafe.save')
  assert.ok(save, 'кнопка сохранения')
  assert.equal(typeof save.props.onClick, 'function', 'сохранение подключено')
  assert.equal(save.props.disabled, true, 'пустой ввод не сохраняется')

  const check = all.find(node => node.type === 'button' && texts(node).join('') === 'githubSafe.again')
  assert.ok(check, 'кнопка «Проверить снова»')
  assert.equal(typeof check.props.onClick, 'function', 'проверка токена подключена')

  // Секции инструкции, запретов и политики — с таблицей прав и ссылкой на GitHub.
  const labels = all.map(node => node.props?.['aria-label']).filter(Boolean)
  for (const key of ['tokenSection', 'howTitle', 'updateTitle', 'warnTitle', 'policyTitle']) {
    assert.ok(labels.includes(`githubSafe.${key}`), `секция ${key}`)
  }
  assert.equal(all.filter(node => node.type === 'tr').length, 8, 'строка заголовка и 7 прав')
  const link = all.find(node => node.type === 'a' && /github\.com\/settings\//.test(node.props?.href ?? ''))
  assert.ok(link, 'ссылка на создание токена')

  // Стили кнопок и адаптив подключены через тег style.
  const firstCard = cards[0]
  assert.equal(firstCard.props.style.background, 'var(--dsw-alias-bg-layer-1)')
  assert.equal(firstCard.props.style.border, '1px solid var(--dsw-alias-border-l2)')
  assert.equal(firstCard.props.style.padding, 16)
  const css = styles.join('\n')
  assert.match(css, /\.dsgh button\.is-primary:hover/)
  assert.match(css, /\.dsgh button\.is-danger:hover/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /@media \(max-width:900px\)/)
  assert.match(css, /@media \(max-width:640px\)/)
  assert.doesNotMatch(css, /#[0-9a-fA-F]{6}/, 'в стилях нет жёстких hex-цветов')

  // Итерация 2: мягкая primary-кнопка, ширина по тексту, прокрутка таблицы.
  assert.equal(save.props.style.height, 36)
  assert.equal(save.props.style.padding, '0 14px')
  assert.equal(save.props.style.borderRadius, 10)
  assert.equal(save.props.style.whiteSpace, 'nowrap')
  assert.match(String(save.props.style.background), /brand-primary\) 18%/)
  assert.match(String(save.props.style.color), /brand-primary/)
  assert.doesNotMatch(JSON.stringify(save.props.style), /#fff|color: ?white/i, 'нет белого текста на заливке')

  const dangerCss = css.includes('state-error-primary) 16%')
  assert.ok(dangerCss, 'danger-кнопка — мягкий красный из CSS')

  const table = all.find(node => node.type === 'table')
  assert.ok(table, 'таблица прав')
  const scroll = tree && elements(tree).find(node => node.props?.style?.overflowX === 'auto' && elements(node).some(child => child.type === 'table'))
  assert.ok(scroll, 'таблица прав обёрнута в контейнер с overflow-x:auto')
  assert.equal(scroll.props.style.maxWidth, '100%')
  assert.equal(input.props.style.minWidth, 0, 'поле не имеет фиксированной min-width')
})

test('client.js: без битых символов в исходнике', async () => {
  const source = await readFile(join(ROOT, 'client.js'), 'utf8')
  assert.ok(!source.includes('\uFFFD'), 'нет символа замены U+FFFD')
  assert.ok(!/Р[ЃЂ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—™љ›њќћџ]/.test(source), 'нет мохито-кодировки cp1251')
})
