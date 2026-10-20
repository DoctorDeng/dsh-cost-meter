/** Read public adapter metadata only; ledger and pricing identities stay unchanged. */
export function createModelLabelReader() {
  const cache = new Map()
  let owner
  const clean = value => typeof value === 'string' && value.trim() && value.length <= 512 ? value.trim() : null
  return async (llm, keys) => {
    const identity = llm?.[Symbol.for('cordis.original')] ?? llm
    if (owner !== identity) { owner = identity; cache.clear() }
    if (typeof llm?.listModels !== 'function') return {}
    const requested = [...new Set(keys)].slice(0, 2000)
    const providers = [...new Set(requested.map(key => key.slice(0, key.indexOf(':'))))].filter(Boolean).slice(0, 64)
    let directory = []
    try { directory = llm.listProviders?.() ?? [] } catch {}
    const names = new Map(Array.isArray(directory) ? directory.map(row => [row.id, clean(row.name)]) : [])
    // Keep one in-flight read per provider and a bounded cache, including failures.
    await Promise.all(providers.map(async provider => {
      let entry = cache.get(provider)
      if (!entry || Date.now() - entry.at > 60000) {
        entry = { at: Date.now(), models: new Map(), pending: null }
        cache.set(provider, entry)
        entry.pending = (async () => {
          let timer
          try {
            const rows = await Promise.race([Promise.resolve().then(() => llm.listModels(provider)), new Promise(resolve => { timer = setTimeout(() => resolve([]), 1000) })])
            for (const row of Array.isArray(rows) ? rows.slice(0, 10000) : []) {
              if (row.provider && row.provider !== provider) continue
              const id = clean(row.id), name = clean(row.name)
              if (id && name) entry.models.set(id, name)
            }
          } catch { /* Missing adapters leave the original ID visible. */ }
          finally { clearTimeout(timer); entry.pending = null }
        })()
      }
      await entry.pending
    }))
    if (cache.size > 64) for (const provider of cache.keys()) if (!providers.includes(provider)) cache.delete(provider)
    return Object.fromEntries(requested.flatMap(key => {
      const split = key.indexOf(':'), provider = key.slice(0, split), model = key.slice(split + 1)
      const name = cache.get(provider)?.models.get(model)
      return name ? [[key, (names.get(provider) || provider) + ':' + name]] : []
    }))
  }
}
