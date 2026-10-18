/** Local-only peak-period progress and one-time update preview. */
window.__ModuleLoader__.load({
  id: 'dsh-cost-meter', chunk: 'client.peak.js',
  factory: require => {
    const React = require('react')
    const { createElement: el, useState, useEffect, useRef, Fragment } = React
    const css = 'PEAK_STYLE_SOURCE'
    const SEEN_KEY = 'dsh-cost-meter:peak-progress-intro-v1'
    const dismissalListeners = new Set()
    let dismissed = false, guideOwner = null
    const wasSeen = () => {
      if (dismissed) return true
      try { return window.localStorage.getItem(SEEN_KEY) === '1' } catch { return false }
    }
    const remember = () => {
      dismissed = true
      try { window.localStorage.setItem(SEEN_KEY, '1') } catch { /* Config is the other persistence channel. */ }
      for (const update of dismissalListeners) update(true)
    }

    function mount(helpers) {
      const { peakView, peakPhaseAt, phaseLabelKeys, countdownText, resolveLocale, makeT, Tooltip } = helpers
      let style = document.getElementById('dsh-cost-meter-peak-style')
      if (!style) { style = document.createElement('style'); style.id = 'dsh-cost-meter-peak-style'; document.head.appendChild(style) }
      style.textContent = css
      /* PEAK_COMPONENT_SOURCE */

      function PeakProgressGuide({ config, api }) {
        const dialog = useRef(null), pending = useRef(false)
        const [closed, setClosed] = useState(wasSeen), [busy, setBusy] = useState(false), [error, setError] = useState(false)
        const [mode, setMode] = useState(config.peakTimeDisplay ?? 'both'), [stamp] = useState(Date.now)
        const en = resolveLocale(config) === 'en', text = (zh, english) => en ? english : zh
        const eligible = config.peakEnabled === true && config.peakNotice !== false && config.peakProgressPromptSeen !== true && config.peakWindows?.length > 0
        const show = eligible && !closed
        useEffect(() => { dismissalListeners.add(setClosed); return () => dismissalListeners.delete(setClosed) }, [])
        useEffect(() => {
          if (!show) return
          const token = {}, previous = document.activeElement, node = dialog.current
          // Wait for existing update guides/dialogs; never stack several modals.
          const observer = new MutationObserver(() => attempt())
          const attempt = () => {
            if (guideOwner || wasSeen() || document.querySelector('dialog[open], .cm-qguide')) return
            guideOwner = token; observer.disconnect(); node?.showModal()
          }
          observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] })
          attempt()
          return () => {
            observer.disconnect()
            if (guideOwner === token) { guideOwner = null; node?.close(); if (previous?.isConnected) previous.focus?.() }
          }
        }, [show])
        if (!show) return null
        const dismiss = () => {
          remember(); setClosed(true)
          Promise.resolve().then(() => api.updateConfig({ peakProgressPromptSeen: true })).catch(() => {})
        }
        const choose = async () => {
          if (pending.current) return
          pending.current = true; setBusy(true); setError(false)
          try {
            const saved = await api.updateConfig({ peakStyle: 'progress', peakTimeDisplay: mode, peakProgressPromptSeen: true })
            if (saved?.config?.peakStyle !== 'progress' || saved.config.peakTimeDisplay !== mode) throw new Error('save failed')
            remember(); setClosed(true)
          } catch { setError(true) }
          finally { pending.current = false; setBusy(false) }
        }
        const preview = { ...config, peakEnabled: true, peakNotice: true, peakEffectiveAt: '', peakTimeDisplay: mode }
        return el('dialog', { ref: dialog, className: 'cm-stat-dialog cm-peak-intro', 'aria-label': text('峰谷时段新增进度条', 'New peak-period progress bar'), onCancel: event => { event.preventDefault(); dismiss() } },
          el('header', { className: 'cm-stat-dialog-head' }, el('strong', null, text('峰谷时段新增进度条', 'New peak-period progress bar')),
            el('button', { type: 'button', className: 'cm-btn', 'aria-label': text('关闭', 'Close'), onClick: dismiss }, '×')),
          el('div', { className: 'cm-stat-dialog-body' },
            el('p', { className: 'cm-peak-intro-description' }, text('显示时段进度、剩余时长和切换时间。简洁两行，紧凑单行；周末和节假日也能看清下一次切换。', 'See time progress, time remaining and the next switch. Simple uses two lines; compact uses one, including weekends and holidays.')),
            el('label', { className: 'cm-peak-intro-field' }, text('显示时间', 'Time display'),
              el('select', { className: 'cm-input', value: mode, onChange: event => setMode(event.target.value) },
                ...[['both', text('倒计时 + 切换时间', 'Countdown + switch time')], ['countdown', text('只看倒计时', 'Countdown')], ['switch', text('只看切换时间', 'Switch time')]].map(([id, label]) => el('option', { key: id, value: id }, label)))),
            el('div', { className: 'cm-peak-intro-previews', 'aria-label': text('当前时段预览', 'Current period preview') },
              ...[['full', text('标准', 'Standard')], ['simple', text('简洁 · 两行', 'Simple · two lines')], ['compact', text('紧凑 · 单行', 'Compact · one line')]].map(([id, label]) =>
                el('section', { key: id, className: 'cm-peak-intro-sample' }, el('span', { className: 'cm-peak-intro-label' }, label),
                  el(PeakProgress, { config: { ...preview, peakProgressVariant: id }, t: makeT(resolveLocale(config)), now: stamp })))),
            el('p', { className: 'cm-peak-intro-note' }, text('按北京时间显示，不改变计价。以后可在“显示”中切换，原样式仍保留。', 'Uses Beijing time and does not change billing. Switch styles later in Display; the existing styles remain available.')),
            error ? el('p', { className: 'cm-msg err', role: 'alert' }, text('保存失败，请重试；也可以先关闭预览。', 'Could not save. Retry or close the preview.')) : null,
            el('div', { className: 'cm-buttons' },
              el('button', { type: 'button', className: 'cm-btn', onClick: dismiss }, text('保留原样', 'Keep current style')),
              el('button', { type: 'button', className: 'cm-btn primary', disabled: busy, onClick: choose }, busy ? text('正在保存…', 'Saving…') : text('使用进度条', 'Use progress bar')))))
      }
      return props => el(props.view === 'guide' ? PeakProgressGuide : PeakProgress, props)
    }
    return { mount }
  },
})
