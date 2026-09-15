(() => {
'use strict';

window.addEventListener('gcad-auth-ready', () => {
  const $ = id => document.getElementById(id);
  const canvas = $('canvas');
  const viewWrap = $('viewWrap');
  const modelTree = $('modelTree');
  if (!canvas || !viewWrap || !modelTree) return;

  // v0.5 UI label
  document.title = 'g-CAD Online v0.5';
  const brandVersion = document.querySelector('#brand span');
  if (brandVersion) brandVersion.textContent = 'Online v0.5';

  // Shared operation prompt shown over the viewport.
  const prompt = document.createElement('div');
  prompt.id = 'operationPrompt';
  Object.assign(prompt.style, {
    display: 'none', position: 'absolute', left: '50%', top: '58px', transform: 'translateX(-50%)',
    zIndex: '30', padding: '9px 16px', borderRadius: '8px', border: '1px solid #41678a',
    background: '#12202df2', color: '#dceeff', fontSize: '13px', fontWeight: '650',
    boxShadow: '0 8px 28px #0008', pointerEvents: 'none', whiteSpace: 'nowrap'
  });
  viewWrap.appendChild(prompt);

  const setStatus = text => { const el = $('statusText'); if (el) el.textContent = text; };
  const showPrompt = text => { prompt.textContent = text; prompt.style.display = 'block'; };
  const hidePrompt = () => { prompt.style.display = 'none'; };

  // ---- Curve tool: quadratic Bezier, stored as a finely sampled Path ----
  let curveMode = null;
  let generatingCurve = false;
  const profileTool = $('profileTool');
  const toolGrid = profileTool?.parentElement;
  let curveTool = $('curveTool');
  if (!curveTool && toolGrid) {
    curveTool = document.createElement('button');
    curveTool.id = 'curveTool';
    curveTool.textContent = '曲線';
    toolGrid.appendChild(curveTool);
  }

  function cancelCurve(message='曲線作成をキャンセル') {
    curveMode = null;
    if (curveTool) curveTool.classList.remove('active');
    canvas.style.cursor = 'default';
    hidePrompt();
    setStatus(message);
  }

  function startCurve() {
    if (curveMode) { cancelCurve(); return; }
    $('pathTool')?.classList.remove('active');
    $('profileTool')?.classList.remove('active');
    document.querySelector('[data-view="top"]')?.click();
    curveMode = { points: [] };
    curveTool?.classList.add('active');
    canvas.style.cursor = 'crosshair';
    showPrompt('曲線の始点をクリックしてください');
    setStatus('曲線作成: 始点を選択');
  }

  function dispatchPathPoint(localX, localY) {
    const r = canvas.getBoundingClientRect();
    const ev = new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, button: 0, buttons: 1,
      clientX: r.left + localX, clientY: r.top + localY, pointerId: 97, pointerType: 'mouse'
    });
    canvas.dispatchEvent(ev);
  }

  function buildBezierPath() {
    const [start, end, control] = curveMode.points;
    generatingCurve = true;
    curveMode = null;
    curveTool?.classList.remove('active');
    $('pathTool')?.click();
    const segments = 40;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments, u = 1 - t;
      const x = u*u*start[0] + 2*u*t*control[0] + t*t*end[0];
      const y = u*u*start[1] + 2*u*t*control[1] + t*t*end[1];
      dispatchPathPoint(x, y);
    }
    $('finishSketch')?.click();
    generatingCurve = false;
    canvas.style.cursor = 'default';
    hidePrompt();
    setStatus('曲線を作成しました。スイープのパスとして使用できます。');
  }

  curveTool?.addEventListener('click', startCurve);

  // Capture viewport clicks only while defining a curve. Existing CAD input receives
  // synthetic sampled points after the 3 defining clicks have been collected.
  canvas.addEventListener('pointerdown', e => {
    if (!curveMode || generatingCurve || e.button !== 0) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const r = canvas.getBoundingClientRect();
    curveMode.points.push([e.clientX - r.left, e.clientY - r.top]);
    const n = curveMode.points.length;
    if (n === 1) {
      showPrompt('曲線の終点をクリックしてください');
      setStatus('曲線作成: 終点を選択');
    } else if (n === 2) {
      showPrompt('曲がり具合を決める制御点をクリックしてください');
      setStatus('曲線作成: 制御点を選択');
    } else if (n === 3) {
      buildBezierPath();
    }
  }, true);

  // ---- Selection-driven Sweep ----
  let sweepMode = null;
  const sweepFocus = $('sweepFocus');
  const sweepPath = $('sweepPath');
  const sweepProfile = $('sweepProfile');
  const createSweep = $('createSweep');
  const sweepPanel = $('sweepPanel');

  // Keep legacy form elements for the v0.4 engine, but hide them from the user.
  sweepPath?.closest('.field')?.style.setProperty('display', 'none');
  sweepProfile?.closest('.field')?.style.setProperty('display', 'none');
  if (createSweep) createSweep.style.display = 'none';
  if (sweepPanel && !sweepPanel.querySelector('.sweepFlowHelp')) {
    const help = document.createElement('div');
    help.className = 'mini sweepFlowHelp';
    help.innerHTML = '操作: <b>線を選択 → スイープ → 断面を選択</b><br>断面を選択すると自動で立体になります。Escでキャンセルできます。';
    sweepPanel.insertBefore(help, sweepPanel.firstChild?.nextSibling || null);
  }

  function selectedTreeItem() {
    return modelTree.querySelector('.treeItem.selected');
  }

  function cancelSweep(message='スイープをキャンセル') {
    sweepMode = null;
    sweepFocus?.classList.remove('active');
    hidePrompt();
    setStatus(message);
  }

  function startSweep() {
    const row = selectedTreeItem();
    const id = row?.dataset.id;
    const kind = row?.querySelector('small')?.textContent?.trim();
    if (!id || kind !== 'Path') {
      showPrompt('先に沿わせる線を選択してください');
      setStatus('スイープ: 先に線・パスを選択してください');
      setTimeout(() => { if (!sweepMode) hidePrompt(); }, 1600);
      return;
    }
    sweepMode = { pathId: id };
    sweepFocus?.classList.add('active');
    if (sweepPath) sweepPath.value = id;
    showPrompt('断面を選択してください');
    setStatus('スイープ: 断面を選択してください');
  }

  sweepFocus?.addEventListener('click', startSweep);

  // Tree selection is the authoritative selection method in v0.5. The listener is on
  // the stable tree container because its rows are rebuilt whenever the model changes.
  modelTree.addEventListener('click', e => {
    if (!sweepMode) return;
    const row = e.target.closest('.treeItem');
    if (!row) return;
    const id = row.dataset.id;
    const kind = row.querySelector('small')?.textContent?.trim();
    if (kind !== 'Profile') {
      showPrompt('断面を選択してください');
      setStatus('スイープ: 閉じた断面を選択してください');
      return;
    }
    const pathId = sweepMode.pathId;
    // Let the normal tree click finish first, then feed the selected path/profile into
    // the existing sweep engine and execute it immediately.
    setTimeout(() => {
      if (!sweepMode) return;
      if (sweepPath) sweepPath.value = pathId;
      if (sweepProfile) sweepProfile.value = id;
      createSweep?.click();
      sweepMode = null;
      sweepFocus?.classList.remove('active');
      hidePrompt();
      setStatus('スイープで立体を作成しました');
    }, 0);
  });

  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (curveMode) { e.preventDefault(); cancelCurve(); return; }
    if (sweepMode) { e.preventDefault(); cancelSweep(); }
  });

  $('newBtn')?.addEventListener('click', () => {
    curveMode = null;
    sweepMode = null;
    curveTool?.classList.remove('active');
    sweepFocus?.classList.remove('active');
    hidePrompt();
  });
}, { once: true });
})();
