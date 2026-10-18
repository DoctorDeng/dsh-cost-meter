// The footer is the real renderer. Selection outlines are a separate local layer,
// so they cannot change direct-child selectors or the compact card layout.
function SidebarPreview({ renderSidebar, config, selected, selectedPlan, select, labels, appearance, text, icon, visibility }) {
  const body = React.useRef(null), [targets, setTargets] = useState([])
  React.useLayoutEffect(() => {
    const root = body.current
    let frame = 0
    const measure = () => {
      const box = root.getBoundingClientRect()
      const next = [...root.querySelectorAll('[data-cm-display]')].slice(0, 32).map(node => {
        node.dataset.previewHidden = String(visibility?.[node.dataset.cmDisplay] === false)
        const rect = node.getBoundingClientRect()
        return { key: node.dataset.cmDisplay, planId: node.dataset.cmPlan, x: rect.left - box.left, y: rect.top - box.top, width: rect.width, height: rect.height }
      }).filter(rect => rect.width > 0 && rect.height > 0)
      setTargets(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    measure()
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) })
    observer.observe(root)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [config, visibility])
  const available = new Set(targets.map(target => target.key))
  const refreshPeakHint = event => {
    if (event.currentTarget.dataset.display !== 'peak') return
    const node = body.current?.querySelector('[data-cm-display="peak"]')
    event.currentTarget.title = (node?.getAttribute('title') || node?.textContent || labels.peak) + text(' · 点击调整', ' · Click to customize')
  }
  return el('div', { className: 'cm-preview-sidebar', style: appearance },
    el('div', { className: 'cm-preview-region-head' }, el('span', null, icon('IconPanelLeftOutlineRegular'), text('侧栏底部', 'Sidebar footer'))),
    el('div', { className: 'cm-preview-history', 'aria-hidden': true }, icon('IconFolderCloseRegular'), text('工作区', 'Workspace'), el('span', null, '···')),
    el('div', { className: 'cm-sidebar-canvas' },
      el('div', { ref: body, className: 'cm-sidebar-live', inert: '' }, renderSidebar(config)),
      el('div', { className: 'cm-sidebar-selection' }, ...targets.map((target, index) =>
        el('button', { key: target.key + index, type: 'button', className: 'cm-sidebar-target', 'data-display': target.key,
          'aria-label': labels[target.key] ?? target.key, 'aria-pressed': selected === target.key && (target.key !== 'plan' || target.planId === selectedPlan),
          title: (labels[target.key] ?? target.key) + text(' · 点击调整', ' · Click to customize'),
          onPointerEnter: refreshPeakHint, onFocus: refreshPeakHint,
          style: { left: target.x, top: target.y, width: target.width, height: target.height }, onClick: () => select(target.key, target.planId) },
          el('span', { className: 'cm-display-item-tag' }, labels[target.key] ?? target.key))))),
    el('div', { className: 'cm-preview-account', 'aria-hidden': true }, icon('IconUserOutlineRegular', 18), text('已登录 DeepSeek', 'Signed in to DeepSeek')),
    el('div', { className: 'cm-sidebar-unplaced' },
      el('p', null, text('未显示的组件', 'Components not shown')),
      ...['balance', 'budget', 'today', 'peak', 'models', 'go'].filter(key => !available.has(key)).map(key =>
        el('button', { key, type: 'button', 'data-display': key, 'aria-pressed': selected === key, onClick: () => select(key) }, labels[key]))))
}
