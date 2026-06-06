/**
 * 个人所得税 App — 主逻辑
 * ============================================
 * 功能：首页展示、收入纳税明细查询、管理员后台
 * 数据持久化：localStorage（带错误兜底）
 * 依赖：无外部库
 */

/* ======================== 常量 ======================== */
const STORAGE_KEY = 'tax-app-custom-state-v5';

const DEFAULT_STATE = Object.freeze({
  searchPlaceholder: '请输入想搜索的功能/服务',
  noticeText: '个人所得税综合所得汇算清缴预约办理时间的通告',
  taxYear: '2026',
  years: Array.from({ length: 26 }, (_, i) => String(2001 + i)),
  detailTitle: '收入纳税明细',
  appealText: '批量申诉',
  recommendTitle: '重点服务推荐',
  autoTotals: true,
  manualIncomeTotal: 33900,
  manualTaxTotal: 415.8,
  taxCalc: {
    enabled: true,
    socialBaseMin: 7460,
    socialBaseMax: 37302,
    fundBaseMin: 2690,
    fundBaseMax: 37302,
    pensionRate: 8,
    medicalRate: 2,
    unemploymentRate: 0.5,
    fundRate: 7,
    monthlyAllowance: 5000,
    monthlySpecialDeduction: 0,
  },
  incomeTypes: ['工资薪金', '劳务报酬', '稿酬', '特许权使用费'],
  records: [
    { type: '工资薪金', date: '2026-04', subType: '正常工资薪金', payer: '上海韩束化妆品销售服务有限公司', income: 0, tax: 0 },
    { type: '工资薪金', date: '2026-03', subType: '正常工资薪金', payer: '上海韩束化妆品销售服务有限公司', income: 9900, tax: 96.6 },
    { type: '工资薪金', date: '2026-02', subType: '正常工资薪金', payer: '上海韩束化妆品销售服务有限公司', income: 12000, tax: 159.6 },
    { type: '工资薪金', date: '2026-01', subType: '正常工资薪金', payer: '上海韩束化妆品销售服务有限公司', income: 12000, tax: 159.6 },
  ],
});

/* ======================== iOS 键盘适配 ======================== */

/** iOS 键盘可见性状态 */
let _keyboardVisible = false;

/** 处理 iOS 键盘弹出/收起（visualViewport API） */
function setupiOSKeyboardHandler() {
  if (!window.visualViewport) return;

  let lastHeight = window.visualViewport.height;
  let lastOffset = 0;

  const handler = () => {
    const vv = window.visualViewport;
    const heightDiff = lastHeight - vv.height;
    const threshold = 120; // 小于此值视为工具栏变化而非键盘

    if (vv.height < lastHeight - threshold) {
      // 键盘弹出
      _keyboardVisible = true;
      document.documentElement.classList.add('keyboard-visible');
      // 如果有激活的输入框，确保它在可视区域
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
        setTimeout(() => active.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
      }
    } else if (vv.height > lastHeight + threshold) {
      // 键盘收起
      if (_keyboardVisible) {
        _keyboardVisible = false;
        document.documentElement.classList.remove('keyboard-visible');
      }
    }

    lastHeight = vv.height;
    lastOffset = vv.offsetTop;
  };

  window.visualViewport.addEventListener('resize', handler);
  window.visualViewport.addEventListener('scroll', handler);
}

/** 自动将输入框滚动到可见区域（iOS 专用） */
function ensureInputVisible(input) {
  if (!input || !/iPad|iPhone|iPod/.test(navigator.userAgent) || window.MSStream) return;

  const scrollContainer = input.closest('.scroll');
  if (!scrollContainer) return;

  setTimeout(() => {
    const rect = input.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    if (rect.bottom > containerRect.bottom - 60 || rect.top < containerRect.top + 60) {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 350); // 等待键盘动画完成
}

/* ======================== 工具函数 ======================== */

/** 深度克隆（兼容旧浏览器） */
function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

/** 格式化金额，保留两位小数 */
function money(value) {
  return Number(value || 0).toFixed(2);
}

/** 数值钳制 */
function clamp(number, min, max) {
  return Math.min(Math.max(Number(number || 0), Number(min || 0)), Number(max || 0));
}

/** HTML 转义 */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  );
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

/** 是否为工资薪金记录 */
function isSalaryRecord(record) {
  return String(record.type || '').includes('工资') || String(record.subType || '').includes('工资');
}

/** DOM 快捷查询 */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/* ======================== 状态管理 ======================== */

/** 默认的空 taxCalc（用于 normalize） */
const DEFAULT_TAX_CALC = clone(DEFAULT_STATE.taxCalc);

/** 加载状态（带错误兜底） */
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return normalizeState(saved ? { ...clone(DEFAULT_STATE), ...saved } : clone(DEFAULT_STATE));
  } catch (e) {
    console.warn('loadState 失败，使用默认状态:', e);
    return normalizeState(clone(DEFAULT_STATE));
  }
}

/** 规范化状态，补全缺失字段 */
function normalizeState(nextState) {
  nextState.taxCalc = { ...DEFAULT_TAX_CALC, ...(nextState.taxCalc || {}) };
  nextState.records = Array.isArray(nextState.records) ? nextState.records : [];
  nextState.incomeTypes = Array.isArray(nextState.incomeTypes) ? nextState.incomeTypes : clone(DEFAULT_STATE.incomeTypes);
  nextState.years = Array.isArray(nextState.years) ? nextState.years : clone(DEFAULT_STATE.years);
  return nextState;
}

/** 保存状态（带错误兜底） */
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('saveState 失败:', e);
  }
}

/* ======================== 业务逻辑 ======================== */

/** 获取当前年份的所有记录，按日期降序排列 */
function currentRecords() {
  const prefix = String(state.taxYear);
  return state.records
    .filter((r) => String(r.date || '').startsWith(prefix))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

// 缓存 currentRecords 结果，避免重复过滤
let _recordsCache = null;
let _recordsCacheKey = '';

function getCachedRecords() {
  const key = state.taxYear + '|' + state.records.length;
  if (_recordsCacheKey !== key) {
    _recordsCache = currentRecords();
    _recordsCacheKey = key;
  }
  return _recordsCache;
}

function invalidateRecordsCache() {
  _recordsCacheKey = '';
}

/** 五险一金月扣除额 */
function monthlyDeductions(income) {
  const cfg = state.taxCalc || {};
  const salary = Number(income || 0);
  if (salary <= 0) return 0;

  const socialBase = clamp(salary, cfg.socialBaseMin, cfg.socialBaseMax);
  const fundBase = clamp(salary, cfg.fundBaseMin, cfg.fundBaseMax);
  const socialRate = (Number(cfg.pensionRate || 0) + Number(cfg.medicalRate || 0) + Number(cfg.unemploymentRate || 0)) / 100;
  const fundRate = Number(cfg.fundRate || 0) / 100;

  return socialBase * socialRate + fundBase * fundRate + Number(cfg.monthlySpecialDeduction || 0);
}

/** 年度累计个税速算表 */
function taxByAnnualTable(taxableIncome) {
  const amount = Math.max(0, Number(taxableIncome || 0));
  const brackets = [
    [36000, 0.03, 0],
    [144000, 0.10, 2520],
    [300000, 0.20, 16920],
    [420000, 0.25, 31920],
    [660000, 0.30, 52920],
    [960000, 0.35, 85920],
    [Infinity, 0.45, 181920],
  ];
  const bracket = brackets.find((item) => amount <= item[0]);
  return Math.max(0, amount * bracket[1] - bracket[2]);
}

/** 重新计算全年税额（仅工资薪金） */
function recalculateTaxForYear() {
  if (!state.taxCalc?.enabled) return;

  const yearRecords = state.records
    .filter((r) => String(r.date || '').startsWith(String(state.taxYear)) && isSalaryRecord(r))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  let cumulativeIncome = 0;
  let cumulativeDeductions = 0;
  let paidTax = 0;

  yearRecords.forEach((record, index) => {
    cumulativeIncome += Number(record.income || 0);
    cumulativeDeductions += monthlyDeductions(record.income);
    const basicDeduction = Number(state.taxCalc.monthlyAllowance || 5000) * (index + 1);
    const cumulativeTaxable = cumulativeIncome - cumulativeDeductions - basicDeduction;
    const cumulativeTax = taxByAnnualTable(cumulativeTaxable);
    const currentTax = Math.max(0, cumulativeTax - paidTax);
    record.tax = Number(currentTax.toFixed(2));
    paidTax += record.tax;
  });
}

/** 获取汇总值 */
function totals() {
  recalculateTaxForYear();
  if (!state.autoTotals) {
    return { income: Number(state.manualIncomeTotal || 0), tax: Number(state.manualTaxTotal || 0) };
  }
  const records = getCachedRecords();
  return records.reduce(
    (sum, r) => {
      sum.income += Number(r.income || 0);
      sum.tax += Number(r.tax || 0);
      return sum;
    },
    { income: 0, tax: 0 }
  );
}

/* ======================== 导航 ======================== */

let activeScreen = 'splash';
let pendingYear = '2026';
let forwardTransitionLocked = false;

function switchScreen(screen, options = {}) {
  const app = $('.app');
  if (options.instant) app.classList.add('instant-switch');

  activeScreen = screen;
  document.body.classList.toggle('nav-visible', screen === 'home');

  $$('.screen').forEach((node) => {
    const isActive = node.id === screen;
    node.classList.toggle('active', isActive);
    node.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });

  if (options.instant) {
    setTimeout(() => app.classList.remove('instant-switch'), 120);
  }

  const splash = $('#splash');
  if (screen === 'splash') {
    splash.classList.remove('retired');
  } else {
    setTimeout(() => {
      if (activeScreen !== 'splash') splash.classList.add('retired');
    }, 380);
  }

  if (screen === 'home') $('#home').scrollTop = 0;
  if (screen === 'detail') $('#detail').scrollTop = 0;
}

function showForwardLoader() {
  const loader = $('#forwardLoader');
  loader.classList.add('open');
  loader.setAttribute('aria-hidden', 'false');
}

function hideForwardLoader() {
  const loader = $('#forwardLoader');
  loader.classList.remove('open');
  loader.setAttribute('aria-hidden', 'true');
}

function forwardScreen(screen) {
  if (forwardTransitionLocked || activeScreen === screen) return;
  forwardTransitionLocked = true;
  showForwardLoader();
  setTimeout(() => {
    try {
      switchScreen(screen, { instant: true });
    } finally {
      hideForwardLoader();
      forwardTransitionLocked = false;
    }
  }, 500);
}

/* ======================== 年份选择器 ======================== */

function getYearList() {
  // 使用配置的年列表，合并当前选中年份，去重、过滤、排序
  const raw = [...new Set([...(state.years || []), state.taxYear])]
    .filter(Boolean)
    .map(String)
    .filter((y) => /^\d{4}$/.test(y))
    .map(Number)
    .sort((a, b) => a - b);

  // 如果配置列表为空，fallback 到 2001-2026
  if (raw.length === 0) {
    return Array.from({ length: 26 }, (_, i) => String(2001 + i));
  }
  return raw.map(String);
}

function setPendingYear(year, shouldScroll = false) {
  pendingYear = String(clamp(Number(year), 2001, 2099));
  $$('.year-option').forEach((node) =>
    node.classList.toggle('selected', node.dataset.year === pendingYear)
  );
  if (shouldScroll) {
    requestAnimationFrame(() => scrollYearToPending(false));
  }
}

function scrollYearToPending(instant = true) {
  const list = $('#yearOptions');
  if (!list) return;
  const selected = [...list.querySelectorAll('[data-year]')].find(
    (node) => node.dataset.year === String(pendingYear)
  );
  if (!selected) return;
  const top = selected.offsetTop - list.clientHeight / 2 + selected.offsetHeight / 2;
  list.scrollTo({ top, behavior: instant ? 'auto' : 'smooth' });
}

function updatePendingYearFromScroll() {
  const list = $('#yearOptions');
  if (!list) return;
  const center = list.scrollTop + list.clientHeight / 2;
  let nearest = null;
  let distance = Infinity;

  $$('.year-option', list).forEach((node) => {
    const nodeCenter = node.offsetTop + node.offsetHeight / 2;
    const nd = Math.abs(nodeCenter - center);
    if (nd < distance) {
      distance = nd;
      nearest = node;
    }
  });

  if (nearest && nearest.dataset.year !== pendingYear) {
    setPendingYear(nearest.dataset.year, false);
  }
}

function renderYearOptions() {
  const years = getYearList();
  $('#yearOptions').innerHTML = years
    .map(
      (year) =>
        `<button class="year-option ${String(pendingYear) === year ? 'selected' : ''}" data-year="${escapeAttr(year)}">${escapeHtml(year)}</button>`
    )
    .join('');
}

/* ======================== 渲染引擎 ======================== */

function render(includeAdmin = true) {
  // 1. data-bind 文本绑定
  $$('[data-bind]').forEach((node) => {
    const key = node.dataset.bind;
    if (key in state) node.textContent = state[key];
  });

  // 2. 收入类型列表
  $('#incomeTypes').innerHTML = state.incomeTypes
    .map((type) => `<div class="type-row"><span class="check"></span><span>${escapeHtml(type)}</span></div>`)
    .join('');

  // 3. 汇总区域
  const total = totals();
  $('#incomeTotal').textContent = money(total.income);
  $('#taxTotal').textContent = money(total.tax);

  // 4. 记录列表
  const records = getCachedRecords();
  $('#recordList').innerHTML = records
    .map(
      (r) => `
        <article class="record">
          <div class="record-head">
            <span>${escapeHtml(r.type)}</span>
            <span class="record-date">${escapeHtml(r.date)}</span>
          </div>
          <div class="record-lines">
            <div class="record-line">所得项目小类：${escapeHtml(r.subType)}</div>
            <div class="record-line">扣缴义务人：${escapeHtml(r.payer)}</div>
            <div class="record-line">收入：${money(r.income)}元</div>
            <div class="record-line">已申报税额：${money(r.tax)}元</div>
          </div>
          <span class="record-arrow"></span>
        </article>`
    )
    .join('');

  // 5. 年份选项
  renderYearOptions();

  // 6. 管理员面板
  if (includeAdmin) renderAdmin();
}

/* ======================== 管理员面板 ======================== */

function renderAdmin() {
  const activeInput = document.activeElement;

  // data-field 输入框
  $$('[data-field]').forEach((input) => {
    const key = input.dataset.field;
    if (activeInput !== input) input.value = state[key] ?? '';
  });

  $('#yearsEditor').value = (state.years || []).join('\n');
  $('#typesEditor').value = state.incomeTypes.join('\n');
  $('#autoTotals').checked = Boolean(state.autoTotals);
  $('#manualIncomeTotal').value = state.manualIncomeTotal;
  $('#manualTaxTotal').value = state.manualTaxTotal;
  $('#taxAutoEnabled').checked = Boolean(state.taxCalc?.enabled);

  // data-tax-field 输入框
  $$('[data-tax-field]').forEach((input) => {
    const key = input.dataset.taxField;
    if (activeInput !== input) input.value = state.taxCalc?.[key] ?? '';
  });

  $('#jsonBox').value = JSON.stringify(state, null, 2);

  // 记录编辑器
  $('#recordEditors').innerHTML = state.records
    .map(
      (r, i) => `
        <div class="record-editor" data-record-index="${i}">
          <div class="record-editor-head">
            <span>${escapeHtml(r.date || '未命名月份')}</span>
            <button class="text-button" data-action="remove-record" data-index="${i}">删除</button>
          </div>
          <div class="form-grid">
            <label class="field">月份<input data-record-field="date" value="${escapeAttr(r.date)}" /></label>
            <label class="field">类型<input data-record-field="type" value="${escapeAttr(r.type)}" /></label>
          </div>
          <label class="field">所得小类<input data-record-field="subType" value="${escapeAttr(r.subType)}" /></label>
          <label class="field">扣缴义务人<input data-record-field="payer" value="${escapeAttr(r.payer)}" /></label>
          <div class="form-grid">
            <label class="field">收入<input data-record-field="income" type="number" step="0.01" value="${Number(r.income || 0)}" /></label>
            <label class="field">税额<input data-record-field="tax" type="number" step="0.01" value="${Number(r.tax || 0)}" /></label>
          </div>
        </div>`
    )
    .join('');
}

/* ======================== 操作处理 ======================== */

function openApp() {
  switchScreen('splash');
  setTimeout(() => switchScreen('home'), 1000);
}

function openYearSheet() {
  pendingYear = state.taxYear;
  renderYearOptions();
  $('#yearLayer').classList.add('open');
  requestAnimationFrame(() => scrollYearToPending(true));
}

function closeYearSheet() {
  $('#yearLayer').classList.remove('open');
}

function openAdmin() {
  $('#adminLayer').classList.add('open');
  renderAdmin();
}

function closeAdmin() {
  $('#adminLayer').classList.remove('open');
  saveState();
  render();
}

function confirmYear() {
  state.taxYear = String(clamp(Number(pendingYear), 2001, 2099));
  // 去重后加入年份列表
  if (!state.years.includes(state.taxYear)) {
    state.years.push(state.taxYear);
  }
  invalidateRecordsCache();
  saveState();
  closeYearSheet();
  render();
}

function addRecord() {
  const yearRecords = state.records.filter((r) => String(r.date).startsWith(state.taxYear));
  // 计算当前年份已有月份数，下一月 = 已有数 + 1，最大 12
  const nextMonth = Math.min(yearRecords.length + 1, 12);
  const month = String(nextMonth).padStart(2, '0');

  state.records.unshift({
    type: state.incomeTypes[0] || '工资薪金',
    date: `${state.taxYear}-${month}`,
    subType: '正常工资薪金',
    payer: '上海韩束化妆品销售服务有限公司',
    income: 0,
    tax: 0,
  });

  invalidateRecordsCache();
  saveState();
  render();
}

function removeRecord(index) {
  state.records.splice(index, 1);
  invalidateRecordsCache();
  saveState();
  render();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tax-app-data-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importJson() {
  try {
    const parsed = JSON.parse($('#jsonBox').value);
    state = normalizeState({ ...clone(DEFAULT_STATE), ...parsed });
    pendingYear = state.taxYear;
    invalidateRecordsCache();
    saveState();
    render();
    openAdmin();
  } catch (e) {
    alert('JSON 格式不正确，请检查后再导入。');
    console.warn('importJson 失败:', e);
  }
}

function resetData() {
  if (!confirm('恢复默认数据？此项操作不可撤销。')) return;
  state = clone(DEFAULT_STATE);
  pendingYear = state.taxYear;
  invalidateRecordsCache();
  saveState();
  render();
  openAdmin();
}

function recalcTax() {
  state.taxCalc.enabled = true;
  recalculateTaxForYear();
  invalidateRecordsCache();
  saveState();
  render();
}

/* ======================== 防抖工具 ======================== */

function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/* ======================== 事件注册 ======================== */

// 防抖版 save+render
const debouncedSave = debounce(() => {
  saveState();
  render(false);
}, 200);

// 点击事件委托
document.addEventListener('click', (event) => {
  // 年份选项
  const yearBtn = event.target.closest('[data-year]');
  if (yearBtn) {
    setPendingYear(yearBtn.dataset.year, true);
    return;
  }

  // 管理员标签切换
  const tab = event.target.closest('[data-admin-tab]');
  if (tab) {
    const target = tab.dataset.adminTab;
    $$('.admin-tab').forEach((node) => node.classList.toggle('active', node === tab));
    $$('.admin-section').forEach((section) =>
      section.classList.toggle('active', section.dataset.adminSection === target)
    );
    return;
  }

  // 动作按钮
  const actionNode = event.target.closest('[data-action]');
  if (!actionNode) return;

  const action = actionNode.dataset.action;
  const actions = {
    'open-app': openApp,
    'go-query': () => {
      if (activeScreen === 'home') forwardScreen('query');
      else switchScreen('query', { instant: true });
    },
    'go-home': () => switchScreen('home', { instant: true }),
    'go-detail': () => forwardScreen('detail'),
    'open-year': openYearSheet,
    'cancel-year': closeYearSheet,
    'confirm-year': confirmYear,
    'open-admin': openAdmin,
    'close-admin': closeAdmin,
    'add-record': addRecord,
    'calculate-tax': recalcTax,
    'remove-record': () => {
      const idx = Number(actionNode.dataset.index);
      if (!isNaN(idx)) removeRecord(idx);
    },
    'export-json': exportJson,
    'import-json': importJson,
    'reset-data': resetData,
  };

  if (actions[action]) actions[action]();
});

// 点击遮罩层关闭
$('#yearLayer').addEventListener('click', (event) => {
  if (event.target.id === 'yearLayer') closeYearSheet();
});
$('#adminLayer').addEventListener('click', (event) => {
  if (event.target.id === 'adminLayer') closeAdmin();
});

// Escape 键关闭弹窗
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeYearSheet();
    $('#adminLayer').classList.remove('open');
  }
});

// 输入事件处理
document.addEventListener('input', (event) => {
  const target = event.target;

  // data-field → 直接写入 state
  const field = target.dataset.field;
  if (field) {
    state[field] = target.value;
    debouncedSave();
    return;
  }

  // 年份编辑器
  if (target.id === 'yearsEditor') {
    state.years = target.value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    // 确保当前年份在列表中
    if (state.taxYear && !state.years.includes(String(state.taxYear))) {
      state.years.push(String(state.taxYear));
    }
    debouncedSave();
    return;
  }

  // 类型编辑器
  if (target.id === 'typesEditor') {
    state.incomeTypes = target.value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    debouncedSave();
    return;
  }

  // 自动汇总开关
  if (target.id === 'autoTotals') {
    state.autoTotals = target.checked;
    invalidateRecordsCache();
    saveState();
    render(false);
    return;
  }

  // 自动计税开关
  if (target.id === 'taxAutoEnabled') {
    state.taxCalc.enabled = target.checked;
    invalidateRecordsCache();
    saveState();
    render(false);
    return;
  }

  // taxCalc 字段
  const taxField = target.dataset.taxField;
  if (taxField) {
    state.taxCalc[taxField] = Number(target.value || 0);
    invalidateRecordsCache();
    saveState();
    render(false);
    return;
  }

  // 手动汇总输入
  if (target.id === 'manualIncomeTotal') {
    state.manualIncomeTotal = Number(target.value || 0);
    saveState();
    render(false);
    return;
  }
  if (target.id === 'manualTaxTotal') {
    state.manualTaxTotal = Number(target.value || 0);
    saveState();
    render(false);
    return;
  }

  // 记录编辑
  const recordField = target.dataset.recordField;
  const recordEditor = target.closest('[data-record-index]');
  if (recordField && recordEditor) {
    const index = Number(recordEditor.dataset.recordIndex);
    const record = state.records[index];
    if (record) {
      record[recordField] = ['income', 'tax'].includes(recordField)
        ? Number(target.value || 0)
        : target.value;
      invalidateRecordsCache();
      saveState();
      render(false);
    }
  }
});

// 年份滚动同步（被动模式，性能更好）
let yearScrollFrame = 0;
$('#yearOptions').addEventListener(
  'scroll',
  () => {
    cancelAnimationFrame(yearScrollFrame);
    yearScrollFrame = requestAnimationFrame(updatePendingYearFromScroll);
  },
  { passive: true }
);

// 页面初始化
window.addEventListener('load', () => {
  state = loadState();
  pendingYear = state.taxYear;
  render();
  switchScreen('splash');
  setTimeout(() => switchScreen('home'), 1000);

  // iOS 键盘适配
  setupiOSKeyboardHandler();

  // iOS 输入框焦点处理
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
    document.addEventListener('focusin', (e) => {
      const input = e.target;
      if (input && (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA' || input.tagName === 'SELECT')) {
        ensureInputVisible(input);
      }
    });
  }
});

// 全局异常捕获 — 防止单点错误影响整体
window.addEventListener('error', (event) => {
  console.warn('全局异常:', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.warn('未处理的 Promise 拒绝:', event.reason);
});

/* ======================== 状态变量（保持最后声明） ======================== */

/** @type {import('./types').AppState} */
let state;
