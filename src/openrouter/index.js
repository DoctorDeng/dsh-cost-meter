/** Read-only OpenRouter price browser, loaded only with Settings > Cost > Prices. */
window.__ModuleLoader__.load({
  id: 'dsh-cost-meter', chunk: 'client.openrouter.js',
  factory: require => {
    const React = require('react')
    const { createElement: el, useState, useEffect, useRef } = React
    function parseCatalog(value) {
      if (!value || typeof value.fetchedAt !== 'string' || typeof value.stale !== 'boolean' || typeof value.error !== 'string' || !Array.isArray(value.models)) throw new Error('Invalid OpenRouter catalog')
      const rate = n => typeof n === 'number' && Number.isFinite(n) && n >= 0
      for (const row of value.models) {
        if (!row || typeof row.id !== 'string' || typeof row.name !== 'string' || !rate(row.input) || !rate(row.output)
          || !['cachedInput', 'cacheWrite'].every(key => row[key] === null || rate(row[key]))
          || !(row.contextLength === null || Number.isSafeInteger(row.contextLength) && row.contextLength >= 0)) throw new Error('Invalid OpenRouter model price')
      }
      return value
    }
    const schema = { parse: parseCatalog }
    const CONTRIBUTION = {
      package: 'dsh-cost-meter-openrouter', face: 'host', descriptors: [{
        id: 'dsh-cost-meter#costMeter/getOpenRouterCatalog', service: 'costMeter', namespace: 'costMeter', method: 'getOpenRouterCatalog',
        invocation: { kind: 'direct' }, parameters: [],
        result: { mode: 'strict', typeSymbol: 'dsh-cost-meter#OpenRouterCatalog', schema, create: () => schema },
      }],
    }
    const modelUrl = id => 'https://openrouter.ai/' + id.split('/').map(encodeURIComponent).join('/')
    const priceText = value => value === null ? '—' : '$' + String(value)
    const changedRates = (before, after) => {
      const old = new Map((before?.models ?? []).map(row => [row.id, row]))
      return new Set(after.models.filter(row => old.has(row.id) && ['input', 'output', 'cachedInput', 'cacheWrite'].some(key => old.get(row.id)[key] !== row[key])).map(row => row.id))
    }
    function PriceBrowser({ api, state, resolveLocale }) {
      const en = resolveLocale(state.config) === 'en', text = (zh, english) => en ? english : zh
      const [value, setValue] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
      const [query, setQuery] = useState(''), [sort, setSort] = useState('name'), [page, setPage] = useState(0)
      const [changed, setChanged] = useState(new Set())
      const refreshRef = useRef(() => {}), previous = useRef(null)
      useEffect(() => {
        let active = true, pending = false
        const refresh = async () => {
          if (!active || pending || document.hidden) return
          pending = true; setBusy(true)
          try {
            const next = await api.getOpenRouterCatalog()
            if (!active) return
            if (!next.stale && next.fetchedAt !== previous.current?.fetchedAt) {
              setChanged(changedRates(previous.current, next)); previous.current = next
            }
            setValue(next); setError(next.error)
          } catch (e) { if (active) setError(String(e?.message ?? e)) }
          finally { pending = false; if (active) setBusy(false) }
        }
        refreshRef.current = refresh
        void refresh()
        const timer = setInterval(refresh, 60000)
        document.addEventListener('visibilitychange', refresh)
        return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
      }, [api])
      const rows = (value?.models ?? []).filter(row => (row.id + ' ' + row.name).toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => (sort === 'name' ? 0 : a[sort] - b[sort]) || a.id.localeCompare(b.id))
      const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 50) - 1))
      const button = (label, onClick, disabled = false) => el('button', { type: 'button', className: 'cm-btn small', onClick, disabled }, label)
      return el('section', { className: 'cm-price-card', 'aria-label': text('OpenRouter 模型价格', 'OpenRouter model prices') },
        el('div', { className: 'cm-price-head', style: { flexWrap: 'wrap' } },
          el('h3', { className: 'cm-h' }, text('OpenRouter 模型价格', 'OpenRouter model prices')),
          button(busy ? text('刷新中…', 'Refreshing…') : text('刷新价格', 'Refresh prices'), () => refreshRef.current(), busy)),
        el('p', { className: 'cm-note' }, text('公开目录 · 美元 / 百万 tokens · 无需 API Key，不产生模型调用费用。打开时和前台每分钟刷新。', 'Public catalog · USD / million tokens · No API key or inference charges. Refreshes on opening and every minute while visible.')),
        el('div', { className: 'cm-buttons' },
          el('input', { className: 'cm-input', type: 'search', value: query, autoComplete: 'off', 'aria-label': text('搜索 OpenRouter 模型', 'Search OpenRouter models'), placeholder: text('搜索模型，例如 flash', 'Search models, e.g. flash'), style: { flex: '1 1 180px', minWidth: 0, maxWidth: '100%' }, onChange: event => { setQuery(event.target.value); setPage(0) } }),
          el('select', { className: 'cm-input', value: sort, 'aria-label': text('价格排序', 'Price order'), onChange: event => { setSort(event.target.value); setPage(0) } },
            ...[['name', text('按模型名称', 'Model name')], ['input', text('输入价格从低到高', 'Input price: low to high')], ['output', text('输出价格从低到高', 'Output price: low to high')]].map(([id, label]) => el('option', { key: id, value: id }, label)))),
        el('p', { className: 'cm-note', role: 'status' }, value?.fetchedAt ? text('最近更新：', 'Last updated: ') + new Date(value.fetchedAt).toLocaleString(en ? 'en-US' : 'zh-CN') : text('尚未取得价格', 'Prices not loaded yet')),
        error ? el('p', { className: 'cm-msg err', role: 'alert' }, (value?.models.length ? text('刷新失败，以下保留上次价格：', 'Refresh failed; previous prices are retained: ') : text('价格查询失败：', 'Price lookup failed: ')) + error) : null,
        rows.length ? el('div', { className: 'cm-scroll', tabIndex: 0, 'aria-label': text('OpenRouter 价格表', 'OpenRouter price table') },
          el('table', { className: 'cm-table' },
            el('thead', null, el('tr', null, ...[text('模型', 'Model'), text('输入', 'Input'), text('输出', 'Output'), text('缓存读取', 'Cache read'), text('缓存写入', 'Cache write'), text('上下文 tokens', 'Context tokens')].map((name, i) => el('th', { key: name, scope: 'col', className: i ? 'num' : undefined }, name)))),
            el('tbody', null, rows.slice(current * 50, current * 50 + 50).map(row => el('tr', { key: row.id },
              el('td', { style: { whiteSpace: 'normal', minWidth: 180, maxWidth: 300, overflowWrap: 'anywhere' } },
                el('a', { href: modelUrl(row.id), target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--dsw-alias-brand-primary)' } }, row.name),
                el('div', { className: 'cm-sess-id' }, row.id),
                changed.has(row.id) ? el('span', { className: 'cm-price-legacy' }, text('价格已变动', 'Price changed')) : null),
              ...['input', 'output', 'cachedInput', 'cacheWrite'].map(key => el('td', { key, className: 'num' }, priceText(row[key]))),
              el('td', { className: 'num' }, row.contextLength === null ? '—' : row.contextLength.toLocaleString()))))))
          : el('p', { className: 'cm-empty' }, busy && !value ? text('正在查询公开目录…', 'Loading public catalog…') : text('没有匹配的模型。', 'No matching models.')),
        el('div', { className: 'cm-buttons' },
          el('span', { className: 'cm-note' }, rows.length ? `${current * 50 + 1}–${Math.min((current + 1) * 50, rows.length)} / ${rows.length}` : '0'),
          button(text('上一页', 'Previous'), () => setPage(current - 1), current === 0),
          button(text('下一页', 'Next'), () => setPage(current + 1), (current + 1) * 50 >= rows.length)),
        el('p', { className: 'cm-note' }, text('显示当前公开 token 参考价；— 表示目录未提供。具体路由、阶梯价格和图片、搜索等附加费用请点模型查看。优惠与实际结算以 OpenRouter 为准。', 'Current public token reference rates; — means unavailable. Open a model for routing, price tiers and extra image/search fees. Promotions and final charges are determined by OpenRouter.')))
    }
    async function mount(ctx) {
      const unmount = await ctx.get('remote').$mount(CONTRIBUTION)
      ctx.effect(() => () => unmount(), 'cost-meter: OpenRouter catalog contribution')
      const remote = ctx.get('remote.costMeter')
      const api = { getOpenRouterCatalog: async () => {
        const result = await remote.getOpenRouterCatalog()
        if (!result?.ok) throw new Error(result?.error?.message || 'OpenRouter price lookup failed')
        return parseCatalog(result.value)
      } }
      return props => el(PriceBrowser, { ...props, api })
    }
    return { mount, PriceBrowser, CONTRIBUTION, parseCatalog, changedRates, priceText, modelUrl }
  },
})
