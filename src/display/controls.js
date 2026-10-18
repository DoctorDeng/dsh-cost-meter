// Real footer markup, clipped and scaled only in the small style selector.
// The editable scene itself always stays at its normal size.
function SidebarStyleSample({ render, config, mode, data, examples }) {
  const sample = React.useMemo(() => render({ ...config, sidebarSimple: mode === 'simple', sidebarStyle: mode === 'compact' ? 'compact' : 'standard' }, data, examples), [render, config, mode, data, examples])
  return el('div', { className: 'cm-style-thumbnail', 'aria-hidden': true, inert: '' },
    el('div', { className: 'cm-style-thumbnail-content' }, sample))
}

// Reuse the real footer renderer with only its peak component enabled. These
// presentation-only configs never reach setDraft, RPC or account-query hooks.
function PeakStyleSample({ render, config, data, style }) {
  const preview = React.useMemo(() => ({ ...config, peakStyle: style, peakEnabled: true, peakNotice: true, peakEffectiveAt: '',
    sidebar: false, hideTodayCost: true, hideOfficialBalance: true, hideBudget: true, codexQuotaEnabled: false,
    budget: { ...config.budget, enabled: false }, balance: { ...config.balance, display: 'off' },
    goQuota: { ...config.goQuota, enabled: false }, sidebarModels: { ...config.sidebarModels, enabled: false },
    codingPlans: {}, gatewayQuotas: { sources: [] }, customBalances: [], customBalance: { enabled: false },
  }), [config, style])
  const sample = React.useMemo(() => render(preview, data), [render, preview, data])
  return el('span', { className: 'cm-peak-choice-sample', 'aria-hidden': true, inert: '' }, sample)
}

function DisplayInspector({ props, config, set, selected, selectedPlan, selectPlan, openQuota, select, labels, registry, text, region, general = false, examples, previewData }) {
  const { t, numInput, CURRENCY_PRESETS, displayOptions, USAGE_POSITION_SWITCHABLE } = props
  const nested = (key, patch) => set({ [key]: { ...config[key], ...patch } })
  const check = (label, value, change) => el('label', { className: 'cm-check', key: label },
    el('input', { type: 'checkbox', checked: value, onChange: e => change(e.target.checked) }), el('span', null, label))
  const field = (label, control) => el('label', { className: 'cm-field', key: label }, el('span', null, label), React.cloneElement(control, { 'aria-label': label }))
  const choice = (label, value, options, change) => field(label, el('select', { className: 'cm-input', value, onChange: e => change(e.target.value) },
    ...options.map(([value, label]) => el('option', { key: value, value }, label))))
  const number = (label, value, change, min = 0, max = 1440) => field(label, numInput({ value, emptyMode: 'ignore' }, v => change(Math.max(min, Math.min(max, v)))))
  const direction = (kind, label = t('barDirectionsTitle')) => choice(label, config.barDirections?.[kind] ?? (kind === 'balance' ? 'remaining' : 'used'),
    [['used', t('barDirectionUsed')], ['remaining', t('barDirectionRemaining')]], value => nested('barDirections', { [kind]: value }))
  const display = key => field(text('显示位置', 'Placement'), el('select', { className: 'cm-input', value: key === 'balance' && config.hideOfficialBalance ? 'off' : config[key]?.display ?? 'both', onChange: e => set({ [key]: { ...config[key], display: e.target.value }, ...(key === 'balance' ? { hideOfficialBalance: e.target.value === 'off' } : {}) }) }, ...displayOptions(t)))
  const todayControls = () => [
    choice(t('sidebarTodayMetric'), config.sidebarTodayMetric ?? 'cost', [['cost', t('sidebarTodayCost')], ['tokens', t('sidebarTodayTokens')]], value => set({ sidebarTodayMetric: value }))]
  const sessionControls = () => [
    choice(t('positionLabel'), config.position ?? 'dock', [['dock', t('positionDock')], ['header', t('positionHeader')], ['off', t('off')]], value => set({ position: value })),
    check(t('sessionCostCompact'), config.sessionCostCompact === true, value => set({ sessionCostCompact: value })),
    el('p', { className: 'cm-inspector-note cm-inspector-help' }, text('悬停查看费用分项。', 'Hover to see the cost breakdown.')),
    check(t('showSessionIdLabel'), config.showSessionId === true, value => set({ showSessionId: value })),
    check(t('includeSubagentCost'), config.includeSubagentCost === true, value => set({ includeSubagentCost: value }))]
  let controls = []
  if (selected === 'budget') controls = [
    config.budget?.enabled !== true && !examples ? el('p', { className: 'cm-inspector-note' }, text('先在“概览”中设置预算，启用后会在这里显示。', 'Set up a budget in Overview to show it here.')) : null,
    check(t('budgetDetailLabel'), config.budget?.detail !== false, value => nested('budget', { detail: value })), direction('budget')]
  if (selected === 'today') controls = todayControls()
  if (selected === 'balance') controls = [display('balance'),
    check(t('balanceShowProgressBar'), config.balance?.showProgressBar === true, value => nested('balance', { showProgressBar: value })),
    config.balance?.showProgressBar === true ? number(t('balanceBudgetCapLabel'), config.balance?.budgetCap ?? '', value => nested('balance', { budgetCap: value || null }), 0, 1e12) : null,
    direction('balance'), number(t('refreshIntervalLabel'), config.balance?.refreshMinutes ?? 5, value => nested('balance', { refreshMinutes: Math.floor(value) }), 1)]
  if (selected === 'go') controls = [
    props.state.goQuota?.status !== 'ok' && !examples ? el('p', { className: 'cm-inspector-note' }, text('配置并获取 Go 额度后显示；这里只调整外观。', 'Shown after Go quota is configured and available.')) : null,
    display('goQuota'), choice(text('主进度条', 'Primary window'), config.goQuota?.main ?? 'rolling', [['rolling', '5h'], ['weekly', text('周', 'Week')], ['monthly', text('月', 'Month')]], value => nested('goQuota', { main: value })),
    check(t('goDetailLabel'), config.goQuota?.detail !== false, value => nested('goQuota', { detail: value })), direction('go'),
    number(t('refreshIntervalLabel'), config.goQuota?.refreshMinutes ?? 15, value => nested('goQuota', { refreshMinutes: Math.floor(value) }), 1)]
  if (selected === 'peak') controls = [el('div', { className: 'cm-peak-control' },
    el('div', { className: 'cm-peak-control-heading' }, text('样式', 'Style')),
    el('div', { className: 'cm-peak-style-choices', role: 'group', 'aria-label': text('峰谷条样式', 'Peak bar style') },
      ...[['progress', text('进度条', 'Progress'), text('时间进度 · 倒计时与切换时刻', 'Time progress, countdown and switch time')],
        ['compact', text('细条', 'Slim'), text('橙蓝细条 · 单行显示', 'Orange and blue strip in one line')],
        ['classic', text('分段', 'Segmented'), text('分段轨道 · 标记与胶囊提示', 'Segments, a marker and a status pill')]].map(([value, label, description]) => {
        const active = (config.peakStyle ?? 'compact') === value
        return el('button', { key: value, type: 'button', className: 'cm-peak-style-choice', title: description, 'aria-label': label, 'aria-pressed': active, onClick: () => set({ peakStyle: value }) },
          el('span', { className: 'cm-peak-choice-heading' }, el('strong', null, label),
            el('span', { className: 'cm-peak-choice-status', 'aria-hidden': true }, active ? text('已选', 'Selected') : el('i'))),
          el(PeakStyleSample, { render: props.renderSidebar, config: previewData.config, data: previewData.state, style: value }))
      }))),
    config.peakStyle === 'progress' ? choice(text('显示时间', 'Time display'), config.peakTimeDisplay ?? 'both',
      [['both', text('倒计时 + 切换时间', 'Countdown + switch time')], ['countdown', text('只看倒计时', 'Countdown')], ['switch', text('只看切换时间', 'Switch time')]], value => set({ peakTimeDisplay: value })) : null]
  if (selected === 'models') controls = [props.renderModelsSettings({ visibilityControl: false })]
  if (selected === 'badge') controls = sessionControls()
  if (selected === 'corner') controls = [['goRolling', 'cornerGoRolling'], ['goWeekly', 'cornerGoWeekly'], ['goMonthly', 'cornerGoMonthly'], ['budget', 'cornerBudget']]
    .map(([key, label]) => check(t(label), config.corner?.[key] !== false, value => nested('corner', { [key]: value })))
  if (selected?.startsWith('strip-')) controls = [direction(selected === 'strip-plans' ? 'plan' : selected.slice(6)),
    check(t('quotaStripEnable'), config.quotaStrip?.enabled === true, value => nested('quotaStrip', { enabled: value, promptSeen: true })),
    ...[['budget', 'quotaStripShowBudget'], ['go', 'quotaStripShowGo'], ['plans', 'quotaStripShowPlans']].map(([key, label]) =>
      check(t(label), config.quotaStrip?.[key] !== false, value => nested('quotaStrip', { [key]: value, promptSeen: true })))]
  if (selected === 'customBalance') controls = [display('customBalance'), number(t('customBalanceRefreshInterval'), config.customBalance?.refreshMinutes ?? 15, value => nested('customBalance', { refreshMinutes: Math.floor(value) }), 1)]
  if (selected === 'plan') {
    const entry = config.codingPlans?.[selectedPlan] ?? {}
    const setPlanDisplay = value => set({ codingPlans: { ...config.codingPlans, [selectedPlan]: { ...entry, display: value } } })
    controls = [
      choice(text('套餐', 'Plan'), selectedPlan, props.planOptions, selectPlan),
      field(text('显示位置', 'Placement'), el('select', { className: 'cm-input', value: entry.display ?? (selectedPlan === 'minimax' ? 'both' : 'settings'), onChange: e => setPlanDisplay(e.target.value) }, ...displayOptions(t))),
      direction('plan', text('所有套餐的进度条方向', 'Bar direction for all plans')),
      el('button', { type: 'button', className: 'cm-btn small', onClick: openQuota }, text('账户与额度设置 →', 'Account and quota settings →')),
    ]
  }
  if (selected === 'codex' || selected === 'strip-codex') controls = [check(t('codexQuotaEnabled'), config.codexQuotaEnabled === true, value => set({ codexQuotaEnabled: value })),
    choice(text('数据源', 'Data source'), config.codexQuotaSource ?? 'auto',
      [['auto', text('自动检测', 'Auto-detect')], ['connect', 'dsh-codex-connect'], ['subscription', 'dsh-codex-subscription']],
      value => set({ codexQuotaSource: value })),
    el('p', { className: 'cm-inspector-note cm-inspector-help' }, text('自动检测优先 dsh-codex-subscription，失败回退 dsh-codex-connect。', 'Auto prefers dsh-codex-subscription, then falls back to dsh-codex-connect.')),
    check(t('codexQuotaSidebar'), config.codexQuotaSidebar !== false, value => set({ codexQuotaSidebar: value })),
    check(t('codexQuotaStrip'), config.codexQuotaStrip !== false, value => set({ codexQuotaStrip: value })),
    ...(selected === 'strip-codex' ? [check(t('quotaStripEnable'), config.quotaStrip?.enabled === true, value => nested('quotaStrip', { enabled: value, promptSeen: true }))] : [])]
  if (selected === 'general') controls = [
    choice(t('languageLabel'), config.locale ?? 'auto', [['auto', t('localeAuto')], ['zh', '简体中文'], ['en', 'English']], value => set({ locale: value })),
    choice(t('currencyLabel'), config.currency ?? 'CNY', [['CNY', t('currencyCny')], ['USD', t('currencyUsd')], ['EUR', t('currencyEur')]], value => set({ currency: value, ...CURRENCY_PRESETS[value], exchangeRate: config.exchangeRateAuto !== false ? config.fxRates?.[value] ?? CURRENCY_PRESETS[value].exchangeRate : CURRENCY_PRESETS[value].exchangeRate })),
    check(text('每日自动更新汇率', 'Update exchange rates daily'), config.exchangeRateAuto !== false, value => set({ exchangeRateAuto: value })),
    config.exchangeRateAuto !== false ? el('p', { className: 'cm-inspector-note' }, text('参考汇率每日更新；历史费用保留记录时的汇率。', 'Daily reference rates; past costs retain their recorded rates.'), config.exchangeRateDate ? ' · ' + config.exchangeRateDate : '') : null,
    number(t('rateLabel'), config.exchangeRate ?? 1, value => set({ exchangeRate: value, exchangeRateAuto: false }), 0.000001, 1e9),
    number(t('decimalsLabel'), config.decimals ?? 2, value => set({ decimals: Math.floor(value) }), 0, 10),
    USAGE_POSITION_SWITCHABLE ? choice(t('usagePositionLabel'), config.usage?.position ?? 'cost', [['cost', t('usagePositionCost')], ['general', t('usagePositionGeneral')], ['section', t('usagePositionSection')]], value => nested('usage', { position: value })) : null]
  if (general) return el('section', { className: 'cm-display-general cm-display-inspector' },
    el('h4', null, text('金额与语言', 'Currency and language')),
    el('p', null, text('统一应用于所有费用组件。', 'Applies to all cost components.')),
    el('div', { className: 'cm-general-grid' }, ...controls))
  const mode = config.sidebarSimple ? 'simple' : config.sidebarStyle === 'compact' ? 'compact' : 'standard'
  const showStyles = region === 'sidebar' && !selected
  const selection = registry[selected]
  return el('aside', { className: 'cm-display-inspector', 'data-component': selected ?? '', 'aria-label': text('外观与组件设置', 'Appearance and component settings') },
    showStyles ? el('div', { className: 'cm-inspector-heading' }, text('侧栏样式', 'Sidebar style'), el('span', null, text('进度卡片示例', 'Progress card examples'))) : null,
    region === 'sidebar' && selected ? el('button', { type: 'button', className: 'cm-inspector-back', onClick: () => select(null) }, text('‹ 返回样式选择', '‹ Back to styles')) : null,
    showStyles ? el('div', { className: 'cm-preview-style-options', role: 'group', 'aria-label': text('侧栏布局', 'Sidebar layout') },
      ...[['simple', text('简洁', 'Simple')], ['standard', text('标准', 'Standard')], ['compact', text('紧凑', 'Compact')]].map(([value, label]) =>
        el('div', { key: value, role: 'button', tabIndex: 0, 'aria-pressed': mode === value,
          onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click() } },
          onClick: () => set({ sidebarSimple: value === 'simple', sidebarSimplePromptSeen: true, ...(value === 'simple' ? {} : { sidebarStyle: value }) }) },
          el(SidebarStyleSample, { render: props.renderStyleSample, config: previewData.config, data: previewData.state, examples, mode: value }), el('span', { className: 'cm-style-caption' }, label)))) : null,
    showStyles && mode === 'compact' ? el('p', { className: 'cm-inspector-note' }, text('多时段额度并排，预算卡保持完整。', 'Quota windows sit side by side; the budget card stays intact.')) : null,
    region === 'sidebar' ? el('div', { className: 'cm-inspector-divider' }) : null,
    field(text('调整组件', 'Customize'), el('select', { className: 'cm-input', value: selected ?? '', onChange: event => select(event.target.value) },
      !selected ? el('option', { value: '', disabled: true, hidden: true }, text('选择组件', 'Choose a component')) : null,
      ...(region === 'sidebar' ? ['budget','balance','today','peak','models','go','plan','customBalance','codex'] : region === 'composer' ? ['strip-budget','strip-go','strip-plans','strip-codex','session-dock','badge','corner','models'] : ['session-header','badge','turn']).map(key => el('option', { key, value: key }, labels[key])))),
    selected ? el('div', { className: 'cm-inspector-controls', key: selected, 'data-inspector': selected },
      selection && !['models', 'today', 'budget', 'peak', 'balance', 'go', 'plan', 'customBalance', 'codex', 'strip-codex'].includes(selected) ? check(text('显示此组件', 'Show this component'), selection.on, () => set(selection.patch)) : null,
      ...controls) : null)
}
