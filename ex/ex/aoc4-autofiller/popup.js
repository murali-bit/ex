let currentData = null;    // flat {KEY: value}
let currentClient = null;  // meta
let clientsIndex = null;

document.addEventListener('DOMContentLoaded', async () => {
  bindTabs();
  bindMain();
  bindPdf();
  bindDebug();
  bindLogs();
  const ps = document.getElementById('phaseSelect');
  for (const p of PHASES) ps.add(new Option(p.label, p.id));
  ps.addEventListener('change', () => { if (currentData) displayFieldList(currentData); });
  await loadClientsIndex();
});

function bindTabs() {
  document.querySelectorAll('.tab').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
}
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'logs') refreshLogs();
  if (name === 'preview' && currentData) displayFieldList(currentData);
}

/* ---------- Clients ---------- */
async function loadClientsIndex() {
  try {
    const url = chrome.runtime.getURL('clients/index.json');
    const res = await fetch(url);
    clientsIndex = await res.json();
    if (clientsIndex.firm) document.getElementById('firmName').textContent = clientsIndex.firm;

    const sel = document.getElementById('clientSelect');
    for (const c of clientsIndex.clients) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} — FY ${c.fy}`;
      sel.appendChild(opt);
    }
  } catch (e) {
    showMessage('error', `Clients index load failed: ${e.message}`);
  }
}

function bindMain() {
  document.getElementById('loadBtn').addEventListener('click', onLoadClient);
  document.getElementById('fillBtn').addEventListener('click', onFill);
  document.getElementById('confirmBtn').addEventListener('click', doFill);
  document.getElementById('cancelBtn').addEventListener('click', () => switchTab('main'));
}

async function onLoadClient() {
  const id = document.getElementById('clientSelect').value;
  if (!id) return showMessage('error', 'Pick a client.');
  const meta = clientsIndex.clients.find(c => c.id === id);
  if (!meta) return showMessage('error', 'Client not found.');

  try {
    const url = chrome.runtime.getURL(meta.file);
    const res = await fetch(url);
    const client = await res.json();
    currentClient = client;
    currentData = flattenClient(client);
    await Storage.save('lastClient', { id: meta.id, data: currentData });
    await Storage.saveLogs({ action: 'loadClient', id: meta.id, keys: Object.keys(currentData).length });

    document.getElementById('clientInfo').classList.remove('hidden');
    document.getElementById('ciName').textContent = client.displayName || meta.name;
    document.getElementById('ciSource').textContent = client.source ? `Source: ${client.source}` : '';

    document.getElementById('fillBtn').disabled = false;
    showMessage('success', `Loaded ${Object.keys(currentData).length} values. Review Preview or click Fill.`);
    switchTab('preview');
  } catch (e) {
    showMessage('error', `Load failed: ${e.message}`);
  }
}

async function onFill() {
  if (!currentData) {
    const last = await Storage.get('lastClient');
    if (last) currentData = last.data;
  }
  if (!currentData) return showMessage('error', 'Load a client first.');

  if (document.getElementById('showPreview').checked) {
    switchTab('preview');
    displayFieldList(currentData);
    return;
  }
  await doFill();
}

async function doFill() {
  const btn = document.getElementById('confirmBtn');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Injecting…';
  showMessage('info', '⏳ Preparing MCA tab…');

  const tab = await getActiveMcaTab();
  if (!tab) {
    btn.disabled = false; btn.textContent = origText;
    return showMessage('error', '❌ Open the AOC-4 form on mca.gov.in first.');
  }

  const phase = currentPhase();
  let jobs;
  try { jobs = buildJobs(currentData, phase.id); }
  catch (e) {
    btn.disabled = false; btn.textContent = origText;
    return showMessage('error', `❌ Data problem: ${e.message}`, 20000);
  }
  const fieldCount = phaseFields(phase.id).length;
  const skipped = fieldCount - jobs.filter(j => j.kind !== 'waitFor').length;
  const r = { filled: 0, skipped, hidden: 0, failed: 0, details: [], dialogs: [], save: null };
  const labelOf = id => (FIELD_MAPPINGS.find(f => f.id === id) || {}).label || id;
  document.getElementById('progressWrap').classList.remove('hidden');
  updateProgress(0, jobs.length);

  try {
    // One field per call: a hang then names the exact field, and a timeout never loses earlier results.
    for (const [i, job] of jobs.entries()) {
      const label = labelOf(job.id);
      btn.textContent = `Filling ${i + 1}/${jobs.length}…`;
      showMessage('info', `⏳ ${i + 1}/${jobs.length}: ${label}`, 60000);

      const limit = job.kind === 'waitFor' ? job.timeout + 20000 : job.kind === 'radio' ? 15000 : 10000;
      let inj;
      try {
        // MAIN world: bypasses MCA page CSP and reaches AEM's own jQuery.
        inj = await withTimeout(chrome.scripting.executeScript({
          target: { tabId: tab.id }, world: 'MAIN', func: pageFill, args: [[job]]
        }), limit, 'timeout');
      } catch (e) {
        if (e.message !== 'timeout') throw e;
        // Page may have frozen (e.g. AGM radio triggers heavy re-render). Wait and retry.
        showMessage('info', `⏳ "${label}" is slow — waiting for MCA to recover…`, 30000);
        let recovered = false;
        for (let wait = 0; wait < 5; wait++) {
          await new Promise(res => setTimeout(res, 3000));
          if (await pageAlive(tab.id)) { recovered = true; break; }
        }
        if (!recovered) {
          // One more long wait — MCA can take 15+ seconds after AGM radios.
          await new Promise(res => setTimeout(res, 10000));
          recovered = await pageAlive(tab.id);
        }
        if (recovered) {
          // Page recovered — retry this field.
          try {
            inj = await withTimeout(chrome.scripting.executeScript({
              target: { tabId: tab.id }, world: 'MAIN', func: pageFill, args: [[job]]
            }), limit, 'timeout');
          } catch (_) {
            // Still failing — record as failed and move on.
            r.details.push({ id: job.id, ok: false, err: `"${label}" timed out twice` });
            r.failed++;
            updateProgress(i + 1, jobs.length);
            continue;
          }
        } else {
          throw new Error(`MCA page froze after setting "${label}". Close any dialog on the MCA tab (reload it if needed), then click Fill again.`);
        }
      }
      const out = inj?.[0]?.result || { results: [{ id: job.id, ok: false, err: 'no result from page' }], dialogs: [] };
      const d = out.results[0];
      r.details.push(d);
      r.dialogs.push(...out.dialogs);
      updateProgress(i + 1, jobs.length);

      if (d.wait) {
        if (!d.ok) throw new Error(job.noCin
          ? 'No CIN in the client file. Add "CIN" under "general" in the client JSON, reload the extension, then click Fill again.'
          : `MCA did not load the company for CIN ${currentData.CIN} within ${job.timeout / 1000}s. Check the CIN in the client file is correct, then click Fill again.`);
        continue;
      }
      if (d.hidden) r.hidden++;
      else d.ok ? r.filled++ : r.failed++;
    }

    // Retry pass: re-check hidden, failed, and empty fields. MCA may have enabled them after DIN/radio processing.
    // Run up to 2 retry rounds with a settling wait before each.
    const skipKinds = new Set(['addRows', 'waitFor']);
    for (let round = 1; round <= 2; round++) {
      const retryIdxs = r.details.map((d, i) => (d.hidden || !d.ok) && !skipKinds.has(jobs[i].kind) ? i : -1).filter(i => i >= 0);
      if (!retryIdxs.length) break;
      btn.textContent = `Retry ${round}…`;
      showMessage('info', `⏳ Retry round ${round}: ${retryIdxs.length} fields…`, 60000);
      await new Promise(res => setTimeout(res, round === 1 ? 3000 : 5000));
      for (const idx of retryIdxs) {
        const job = { ...jobs[idx], onlyIfEmpty: false, forceFill: round >= 2 };
        try {
          const inj = await withTimeout(chrome.scripting.executeScript({
            target: { tabId: tab.id }, world: 'MAIN', func: pageFill, args: [[job]]
          }), 10000, 'timeout');
          const out = inj?.[0]?.result || { results: [{ id: job.id, ok: false, err: 'no result' }], dialogs: [] };
          const d2 = out.results[0];
          r.dialogs.push(...(out.dialogs || []));
          const oldD = r.details[idx];
          if (d2.ok && !d2.hidden) {
            if (oldD.hidden) r.hidden--;
            else if (!oldD.ok) r.failed--;
            r.filled++;
            r.details[idx] = d2;
          } else if (!d2.hidden && oldD.hidden) {
            r.hidden--;
            r.failed++;
            r.details[idx] = d2;
          }
        } catch (_) { /* keep original result */ }
      }
    }

    // Extra pass: re-set all select/designation fields after DINs have settled — MCA cross-validates DIN+designation.
    const selectIdxs = jobs.map((j, i) => j.kind === 'select' ? i : -1).filter(i => i >= 0);
    if (selectIdxs.length) {
      btn.textContent = 'Re-setting designations…';
      showMessage('info', `⏳ Re-confirming ${selectIdxs.length} dropdown fields…`, 60000);
      await new Promise(res => setTimeout(res, 3000));
      for (const idx of selectIdxs) {
        const job = { ...jobs[idx], onlyIfEmpty: false, forceFill: true };
        try {
          const inj = await withTimeout(chrome.scripting.executeScript({
            target: { tabId: tab.id }, world: 'MAIN', func: pageFill, args: [[job]]
          }), 15000, 'timeout');
          const out = inj?.[0]?.result || { results: [] };
          const d2 = out.results[0];
          if (d2 && d2.ok) {
            const oldD = r.details[idx];
            if (!oldD.ok) { r.failed--; r.filled++; }
            r.details[idx] = d2;
          }
        } catch (_) {}
      }
    }

    // Re-read what we set: MCA rules can wipe a value after it was accepted (e.g. a date that breaks a cross-check).
    const filledIds = new Set(r.details.filter(d => d.ok && !d.hidden && !d.wait && !d.note).map(d => d.id));
    const toCheck = jobs.filter(j => filledIds.has(j.id));
    r.reset = [];
    if (toCheck.length) {
      btn.textContent = 'Checking…';
      showMessage('info', '⏳ Checking MCA kept every value…', 60000);
      const [v] = await withTimeout(chrome.scripting.executeScript({
        target: { tabId: tab.id }, world: 'MAIN', func: pageVerify, args: [toCheck]
      }), 15000, 'Verify step timed out — check the MCA tab.');
      r.reset = v?.result || [];
      r.filled -= r.reset.length;
      r.failed += r.reset.length;
    }
    const resetNote = r.reset.length
      ? ` · MCA reset ${r.reset.length}: ${r.reset.map(x => `${labelOf(x.id)} (now "${x.now}")`).join('; ')}`
      : '';

    let saveNote = '';
    if (r.reset.length && document.getElementById('autoSubmit').checked) {
      saveNote = ' · Save NOT clicked because MCA reset some fields — fix those, then click Save yourself';
    } else if (document.getElementById('autoSubmit').checked) {
      btn.textContent = 'Saving…';
      const [s] = await chrome.scripting.executeScript({
        target: { tabId: tab.id }, world: 'MAIN', func: pageSave, args: [phase.saveIndex]
      });
      r.save = s?.result || { clicked: false };
      saveNote = r.save.clicked
        ? ` · Save clicked${r.save.dialogs.length ? ` — MCA said: "${r.save.dialogs.map(d => d.msg).join(' | ')}"` : ''}`
        : ' · Save button not found — click Save on the MCA page yourself';
    }

    const icon = r.failed ? '⚠️' : '✅';
    const dlg = r.dialogs.length ? ` · ${r.dialogs.length} page dialog(s) auto-closed (see Logs)` : '';
    const hid = r.hidden ? ` · Not on form ${r.hidden}` : '';
    showMessage(r.failed ? 'warning' : 'success',
      `${icon} ${phase.label}: Filled ${r.filled} · Skipped ${r.skipped}${hid} · Failed ${r.failed}${resetNote}${dlg}${saveNote}`, 30000);
    btn.textContent = `${icon} ${r.filled} filled`;
    const selectDebug = r.details.filter(d => d.debug).map(d => ({ id: d.id, ...d.debug }));
    await Storage.saveLogs({ action: 'fill', phase: phase.id, filled: r.filled, skipped: r.skipped, hidden: r.hidden,
      failed: r.failed, failures: r.details.filter(d => !d.ok), resetByMca: r.reset,
      notOnForm: r.details.filter(d => d.hidden).map(d => d.id),
      via: r.details.filter(d => d.via).map(d => `${d.id}:${d.via}`).join(' '),
      selectDebug: selectDebug.length ? selectDebug : undefined,
      dialogs: r.dialogs, save: r.save });
  } catch (e) {
    showMessage('error', `❌ ${e.message}`, 20000);
    await Storage.saveLogs({ action: 'fill', error: e.message, filledSoFar: r.filled, failures: r.details.filter(d => !d.ok) });
  } finally {
    setTimeout(() => { btn.textContent = origText; btn.disabled = false; }, 2500);
  }
}

async function pageAlive(tabId) {
  try {
    await withTimeout(chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: () => true }), 3000, 'dead');
    return true;
  } catch (_) { return false; }
}

function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))
  ]);
}

async function getActiveMcaTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !/mca\.gov\.in/.test(tab.url)) return null;
  return tab;
}

function currentPhase() {
  const id = Number(document.getElementById('phaseSelect').value) || 1;
  return PHASES.find(p => p.id === id) || PHASES[0];
}

function phaseFields(phaseId) {
  return FIELD_MAPPINGS.filter(f => f.phase === phaseId && f.kind !== 'waitFor' && f.kind !== 'addRows');
}

function buildJobs(data, phaseId) {
  const jobs = [];
  for (const f of FIELD_MAPPINGS) {
    if (f.phase !== phaseId) continue;
    const v = data[f.key];
    const empty = v === undefined || v === null || v === '';
    const kind = f.kind || 'text';
    // Most of the section stays hidden until MCA loads the company from the CIN, so always check that first.
    if (kind === 'waitFor') {
      jobs.push({ id: f.id, kind, selector: f.selector, index: 0, value: '',
        timeout: empty ? 1500 : f.timeout, noCin: empty, nudge: empty ? null : (f.nudge || null) });
      continue;
    }
    if (kind === 'addRows') {
      jobs.push({ id: f.id, kind, selector: f.selector, index: 0, need: f.need || 2, value: '' });
      continue;
    }
    if (empty) continue;
    const job = {
      id: f.id,
      kind,
      name: f.name || null,
      selector: f.selector || null,
      index: f.index || 0,
      onlyIfEmpty: !!f.onlyIfEmpty,
      typeChars: !!f.typeChars,
      doneSelector: f.doneSelector || null,
      timeout: f.timeout || 0,
      waitAfterMs: f.waitAfterMs || 0,
      value: kind === 'date' ? toDDMMYYYY(v) : String(v)
    };
    if (f.optionMap) {
      const o = f.optionMap[String(v)];
      if (!o) throw new Error(`${f.label}: "${v}" is not one of ${Object.keys(f.optionMap).join(' / ')}`);
      job.optionRe = o.re;
      job.optionNot = o.not || null;
    }
    jobs.push(job);
  }
  return jobs;
}

function toDDMMYYYY(s) {
  const p = String(s).trim().split(/[\/\-\.]/);
  if (p.length !== 3) return String(s);
  let [d, m, y] = p[0].length === 4 ? [p[2], p[1], p[0]] : p;
  if (y.length === 2) y = '20' + y;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

// Serialized into the page by executeScript: must be self-contained (no outer references).
async function pageFill(jobs) {
  // Native dialogs block the page thread and would freeze the fill; record and auto-accept them.
  const dialogs = [];
  const saved = { alert: window.alert, confirm: window.confirm, prompt: window.prompt };
  window.alert = m => { dialogs.push({ type: 'alert', msg: String(m) }); };
  window.confirm = m => { dialogs.push({ type: 'confirm', msg: String(m) }); return true; };
  window.prompt = (m, d) => { dialogs.push({ type: 'prompt', msg: String(m) }); return d ?? ''; };
  const pause = ms => new Promise(res => setTimeout(res, ms));

  const $ = window.jQuery;
  // AEM keeps hidden questions in the DOM; setting them can wedge its rules, so leave them alone.
  // Radios are often visually replaced by a styled label, so a visible parent counts; other inputs must render themselves.
  const shown = el => el.type === 'radio'
    ? !!(el.getClientRects().length || (el.parentElement && el.parentElement.getClientRects().length))
    : el.getClientRects().length > 0;
  const norm = s => String(s || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  const protoFor = el => el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
    : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;

  function setNative(el, v) {
    const d = Object.getOwnPropertyDescriptor(protoFor(el), 'value');
    if (d && d.set) d.set.call(el, v); else el.value = v;
  }
  function fire(el) {
    for (const t of ['input', 'change']) el.dispatchEvent(new Event(t, { bubbles: true }));
    el.dispatchEvent(new FocusEvent('blur'));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    if ($) { try { $(el).trigger('input').trigger('change').trigger('blur').trigger('focusout'); } catch (_) {} }
  }

  // AEM keeps the real value in its form model; DOM-only edits get wiped when MCA re-renders after the CIN lookup.
  // Widget ids are "<componentId>_widget" (radios: "<componentId>-N_widget").
  let nodes = null;
  function modelNode(el) {
    const gb = window.guideBridge;
    if (!gb || typeof gb.visit !== 'function') return null;
    if (!nodes) {
      nodes = new Map();
      try { gb.visit(c => { if (c && c.id) nodes.set(c.id, c); }); } catch (_) { return null; }
    }
    const id = (el.id || '').replace(/-\d+_widget$/, '').replace(/_widget$/, '');
    let node = nodes.get(id);
    if (!node) {
      // Fallback: try name-based lookup (select elements may use name as component id).
      const name = (el.name || '').replace(/___jqName$/, '').replace(/_widget$/, '');
      node = nodes.get(name);
    }
    if (!node) {
      // Fallback: look for a node whose id is a suffix of our element's id or name.
      const elId = id || (el.name || '').replace(/___jqName$/, '');
      for (const [k, v] of nodes) {
        if (elId.endsWith(k) || k.endsWith(elId)) { node = v; break; }
      }
    }
    return node || null;
  }
  function setModel(el, v) {
    const node = modelNode(el);
    if (!node) return false;
    let val = v;
    if (/datepicker/i.test(node.className || '') && /^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
      const [d, m, y] = v.split('/');
      val = `${y}-${m}-${d}`; // date pickers store ISO; text boxes with a DD/MM/YYYY mask take it as typed
    }
    try { node.value = val; return true; } catch (_) { return false; }
  }

  const results = [];
  try {
  for (const j of jobs) {
    await pause(120);
    try {
      if (j.kind === 'radio') {
        const group = [...document.querySelectorAll('input[type="radio"]')].filter(r => r.name === j.name);
        if (!group.length) { results.push({ id: j.id, ok: false, err: 'radio group not found' }); continue; }
        const want = norm(j.value);
        const txt = r => [norm(r.getAttribute('aria-label')), norm(r.value),
          norm(r.labels && r.labels[0] && r.labels[0].textContent)];
        const hit = group.find(r => txt(r).some(t => t === want))
          || group.find(r => txt(r).some(t => t && (t.includes(want) || want.includes(t))));
        if (!hit) { results.push({ id: j.id, ok: false, err: `option "${j.value}" not in group [${group.map(r => r.getAttribute('aria-label') || r.value).join(', ')}]` }); continue; }
        // Skip if already selected.
        if (hit.checked) { results.push({ id: j.id, ok: true, note: 'already selected' }); continue; }
        if (!shown(hit)) { results.push({ id: j.id, ok: true, hidden: true, note: 'not shown on form — skipped' }); continue; }
        if (hit.disabled) { results.push({ id: j.id, ok: true, hidden: true, note: 'locked by MCA — skipped' }); continue; }
        // Human-like: scroll into view, pause, click once, let MCA process.
        hit.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await pause(300);
        hit.click();
        await pause(200);
        if (!hit.checked) { hit.checked = true; hit.dispatchEvent(new Event('change', { bubbles: true })); }
        setModel(hit, hit.value);
        // Wait for MCA to process the radio change — it can trigger heavy re-renders (e.g. AGM).
        // Check page responsiveness: try a small DOM read after each wait.
        for (let w = 0; w < 6; w++) {
          await pause(1000);
          try { document.body.offsetHeight; break; } catch (_) {}
        }
        results.push({ id: j.id, ok: hit.checked, via: 'dom+model',
          err: hit.checked ? null : 'radio did not stay selected' });
        continue;
      }

      if (j.kind === 'addRows') {
        const rowEls = document.querySelectorAll(j.selector);
        const have = rowEls.length;
        const need = j.need || 2;
        if (have >= need) {
          results.push({ id: j.id, ok: true, note: `table already has ${have} rows` });
        } else {
          let addBtn = null;
          if (have > 0) {
            const table = rowEls[0].closest('table') || rowEls[0].closest('[class*="table"]') || rowEls[0].closest('.guideTableNode');
            if (table) addBtn = table.parentElement.querySelector('button[class*="addRow"], button.tableAddRow, button[title*="Add"], button[aria-label*="Add"]');
          }
          if (!addBtn) {
            // AEM tables: look for the closest repeatable panel's add button
            if (have > 0) {
              const panel = rowEls[0].closest('.guideTableRuntimeRow, [data-guide-table-row], .guide-table-row, .guideTableNode, [class*="panel"]');
              if (panel) {
                const container = panel.parentElement;
                if (container) addBtn = container.querySelector('button[class*="add"], button.guideTableAdd, [class*="addButton"], [class*="addRow"]');
              }
            }
          }
          if (!addBtn) addBtn = document.querySelector('button.tableAddRow, button[class*="addRow"], button[title*="Add Row"], button[aria-label*="add"]');
          if (addBtn) {
            for (let c = have; c < need; c++) {
              addBtn.scrollIntoView({ block: 'center', behavior: 'smooth' });
              await pause(300);
              addBtn.click();
              await pause(800);
            }
          }
          const nowHave = document.querySelectorAll(j.selector).length;
          results.push({ id: j.id, ok: nowHave >= need, note: `expanded ${have} → ${nowHave} rows (need ${need})` });
        }
        continue;
      }

      const all = document.querySelectorAll(j.selector);
      const el = all[j.index];
      if (!el) {
        results.push({ id: j.id, ok: false, err: j.index ? `row ${j.index + 1} not found (form has ${all.length})` : 'element not found' });
        continue;
      }

      if (j.kind === 'waitFor') {
        const until = Date.now() + j.timeout;
        let nudged = false;
        while (!el.value.trim() && Date.now() < until) {
          await pause(250);
          // Lookup didn't start: poke the source field again (Enter + leave), once, halfway through.
          if (j.nudge && !nudged && until - Date.now() < j.timeout / 2) {
            nudged = true;
            const src = document.querySelector(j.nudge);
            if (src) {
              src.focus();
              for (const t of ['keydown', 'keypress', 'keyup'])
                src.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
              src.dispatchEvent(new Event('change', { bubbles: true }));
              src.blur();
              if ($) { try { $(src).trigger('change').trigger('blur'); } catch (_) {} }
            }
          }
        }
        if (!el.value.trim()) {
          results.push({ id: j.id, wait: true, ok: false, err: `MCA did not auto-fill within ${j.timeout / 1000}s — check the CIN` });
          continue;
        }
        // The name arrives first; MCA keeps loading (application history etc.) and rewrites fields for a while.
        // Wait until nothing on the form has changed for 3s (max 15s) so we don't fill into a moving target.
        const snap = () => [...document.querySelectorAll('input, select, textarea')]
          .map(e => (e.type === 'radio' || e.type === 'checkbox') ? (e.checked ? 1 : 0) : e.value).join('\u0001');
        let last = snap(), quietSince = Date.now();
        const hardStop = Date.now() + 15000;
        while (Date.now() - quietSince < 3000 && Date.now() < hardStop) {
          await pause(500);
          const s = snap();
          if (s !== last) { last = s; quietSince = Date.now(); }
        }
        results.push({ id: j.id, wait: true, ok: true, note: `form settled after ${Math.round((Date.now() - until + j.timeout) / 1000)}s` });
        continue;
      }

      if (!shown(el)) { results.push({ id: j.id, ok: true, hidden: true, note: 'not shown on form — skipped' }); continue; }
      if (el.disabled || el.readOnly) {
        if (j.forceFill) {
          el.disabled = false;
          el.readOnly = false;
          el.removeAttribute('disabled');
          el.removeAttribute('readonly');
        } else {
          results.push({ id: j.id, ok: true, hidden: true, note: `locked by MCA — skipped${el.value ? ` (has "${el.value}")` : ''}` });
          continue;
        }
      }

      // Human-like: scroll into view and pause before interacting.
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      await pause(200);

      if (j.onlyIfEmpty && el.value.trim()) {
        results.push({ id: j.id, ok: true, note: 'kept value MCA pre-filled' });
        continue;
      }

      // Skip if field already has the correct value (avoids retyping on re-runs).
      // For selects: also check for AEM validation errors — if error shows, don't skip even if value looks correct.
      if (!j.forceFill) {
        const cur = el.value.trim();
        const want = (j.value || '').trim();
        const digits = s => String(s).replace(/[^\d]/g, '');
        if (el.tagName === 'SELECT') {
          const selText = norm(el.options[el.selectedIndex]?.textContent || '');
          if (selText === norm(want) || norm(cur) === norm(want)) {
            const errW = el.closest('.guideFieldNode, .guideFieldWrapper, [data-guide-au]');
            const hasVisibleErr = errW && errW.querySelector('.guideFieldError, [class*="error"]:not([style*="display: none"])');
            if (!hasVisibleErr) {
              results.push({ id: j.id, ok: true, note: 'already correct' });
              continue;
            }
          }
        } else if (cur && (cur === want || cur.toUpperCase() === want.toUpperCase()
            || cur.toUpperCase().includes(want.toUpperCase()) || digits(cur) === digits(want))) {
          results.push({ id: j.id, ok: true, note: 'already correct' });
          continue;
        }
      }

      if (j.kind === 'select' || el.tagName === 'SELECT') {
        // For designation fields: wait for MCA's DIN lookup to auto-fill before touching.
        const isDesig = j.id && /DESIG/i.test(j.id);
        if (isDesig) {
          const preText = (el.options[el.selectedIndex]?.textContent || '').trim();
          if (!preText || /^select$/i.test(preText) || el.selectedIndex <= 0) {
            for (let w = 0; w < 12; w++) {
              await pause(500);
              const nowText = (el.options[el.selectedIndex]?.textContent || '').trim();
              if (nowText && !/^select$/i.test(nowText) && el.selectedIndex > 0) break;
            }
          }
          const mcaText = norm(el.options[el.selectedIndex]?.textContent || '');
          const wantText = norm(j.value);
          const desigErrWidget = el.closest('.guideFieldNode, .guideFieldWrapper, [data-guide-au]');
          const hasVisibleDesigErr = desigErrWidget && desigErrWidget.querySelector(
            '.guideFieldError:not(:empty), [class*="error"]:not([style*="display: none"]):not(:empty)'
          );
          // A matching label is not enough when MCA still marks the field invalid.
          // Re-select it below so AEM receives the change/validation events.
          if (mcaText === wantText && !hasVisibleDesigErr) {
            results.push({ id: j.id, ok: true, note: 'MCA auto-filled correctly' });
            continue;
          }
        }

        const opts = [...el.options].filter(o => o.value !== '');
        let opt;
        if (j.optionRe) {
          const re = new RegExp(j.optionRe, 'i');
          const not = j.optionNot ? new RegExp(j.optionNot, 'i') : null;
          opt = opts.find(o => re.test(o.textContent) && !(not && not.test(o.textContent)));
        } else {
          const want = norm(j.value);
          opt = opts.find(o => norm(o.textContent) === want || norm(o.value) === want)
            || opts.find(o => norm(o.textContent).includes(want) || want.includes(norm(o.textContent)));
        }
        if (!opt) {
          results.push({ id: j.id, ok: false, err: `option "${j.value}" not in list [${opts.map(o => o.textContent.trim()).join(' | ')}]` });
          continue;
        }

        const selNode = modelNode(el);
        const optIdx = [...el.options].indexOf(opt);
        let via = 'none';
        let errCleared = false;
        const preSetValue = el.options[el.selectedIndex]?.textContent?.trim() || '(empty)';

        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await pause(300);

        // ── APPROACH 1: Find & click AEM's custom dropdown widget ──
        // AEM adaptive forms often render a custom UI over the native <select>.
        // Look for the interactive wrapper and click through it like a real user would.
        const guideNode = el.closest('.guideDropDownList, .guideFieldNode, .guideFieldWrapper, [data-guide-au]');
        let widgetClicked = false;
        if (guideNode) {
          // AEM renders a styled button/trigger for the dropdown.
          const trigger = guideNode.querySelector(
            'button.guideDropDownButton, button[class*="dropdown"], .guideWidgetContainer > button, ' +
            '.coral-Select-button, [role="combobox"], [role="listbox"], .guide-dropdown-trigger'
          ) || guideNode.querySelector('button') || null;

          // Also look for any custom list container that appears when dropdown opens.
          if (trigger) {
            trigger.scrollIntoView({ block: 'center', behavior: 'smooth' });
            await pause(200);
            trigger.click();
            await pause(500);

            // Look for the opened custom option list.
            const listContainer = guideNode.querySelector(
              '.coral-SelectList, [role="listbox"], ul.guide-dropdown-options, ' +
              '.guideDropDownOptions, ul[class*="select"], ul[class*="dropdown"]'
            ) || document.querySelector('.coral-SelectList:not([style*="display: none"])');

            if (listContainer) {
              const listItems = [...listContainer.querySelectorAll(
                'li, [role="option"], .coral-SelectList-item, .guide-dropdown-item'
              )];
              const wantNorm = norm(opt.textContent.trim());
              const hit = listItems.find(li => norm(li.textContent) === wantNorm)
                || listItems.find(li => norm(li.textContent).includes(wantNorm));
              if (hit) {
                hit.scrollIntoView({ block: 'center' });
                await pause(100);
                // Full mouse event sequence to simulate a real click.
                for (const ev of ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click']) {
                  hit.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }));
                }
                await pause(500);
                widgetClicked = true;
                via = 'widget-click';
              }
            }
            // Close dropdown if it's still open (click outside).
            if (!widgetClicked) {
              document.body.click();
              await pause(200);
            }
          }
        }

        // ── APPROACH 2: Native <select> + jQuery change (fallback) ──
        if (!widgetClicked) {
          el.focus();
          el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
          await pause(150);
          el.selectedIndex = optIdx;
          setNative(el, opt.value);
          await pause(100);
          el.dispatchEvent(new Event('change', { bubbles: true }));
          await pause(300);
          el.blur();
          el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
          el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
          if ($) {
            try { $(el).val(opt.value).trigger('change').trigger('blur').trigger('focusout'); } catch (_) {}
          }
          await pause(300);
          via = 'dom';
        }

        // ── APPROACH 3: AEM model sync ──
        // If AEM's change handler didn't propagate, set the model directly.
        let modelOk = false;
        if (selNode) {
          const curVal = selNode.value;
          if (norm(String(curVal)) === norm(opt.value) || norm(String(curVal)) === norm(opt.textContent.trim())) {
            modelOk = true;
          }
          if (!modelOk) {
            let enumVal = opt.value;
            const enums = selNode.enum_ || selNode['enum'] || selNode.options;
            const enumNames = selNode.enumNames || selNode.optionNames;
            if (enumNames && enums) {
              const idx = (Array.isArray(enumNames) ? enumNames : []).findIndex(n => norm(n) === norm(opt.textContent.trim()));
              const enumArr = Array.isArray(enums) ? enums : [];
              if (idx >= 0 && enumArr[idx] !== undefined) enumVal = enumArr[idx];
            }
            try { selNode.value = enumVal; modelOk = true; via += '+model'; } catch (_) {}
          }
        }

        // ── Trigger AEM & jQuery UI events that guide forms listen for ──
        if ($) {
          try {
            // AEM adaptive form events.
            $(el).trigger('guideValueChanged');
            $(el).trigger('guideValueCommit');
            $(el).trigger('elementValueChanged');
            $(el).trigger('guideFieldValueChanged');
            // jQuery UI selectmenu: if MCA uses it, refresh the widget.
            try { $(el).selectmenu('refresh'); } catch (_) {}
          } catch (_) {}
          await pause(300);
        }
        if (selNode) {
          try { if (typeof selNode.validate === 'function') selNode.validate(); } catch (_) {}
        }

        // ── ERROR CHECK & RECOVERY ──
        await pause(500);
        const errWidget = el.closest('.guideFieldNode, .guideFieldWrapper, [data-guide-au]');
        let hasErr = errWidget && errWidget.querySelector('.guideFieldError:not(:empty), [class*="error"]:not([style*="display: none"]):not(:empty)');

        if (hasErr) {
          // Recovery: click the native <select> to open it, then use keyboard to select.
          el.focus();
          await pause(200);
          el.click();
          await pause(300);
          // Set to empty first, then to target — simulates user changing selection.
          el.selectedIndex = 0;
          setNative(el, '');
          el.dispatchEvent(new Event('change', { bubbles: true }));
          await pause(200);
          el.selectedIndex = optIdx;
          setNative(el, opt.value);
          el.dispatchEvent(new Event('change', { bubbles: true }));
          await pause(300);
          el.blur();
          fire(el);
          if ($) { try { $(el).val(opt.value).trigger('change').trigger('guideValueChanged'); } catch (_) {} }
          if (selNode) {
            try { selNode.value = opt.value; } catch (_) {}
            try { if (typeof selNode.validate === 'function') selNode.validate(); } catch (_) {}
          }
          await pause(500);

          // Re-check the error after the re-selection. Never hide MCA validation
          // messages here: that would make the form look valid without fixing it.
          hasErr = errWidget && errWidget.querySelector('.guideFieldError:not(:empty), [class*="error"]:not([style*="display: none"]):not(:empty)');
        }

        const took = el.value === opt.value;
        // Collect diagnostic info.
        let debug = null;
        try {
          // Capture error text if present.
          const finalErrEls = errWidget ? errWidget.querySelectorAll('.guideFieldError, [class*="error"]') : [];
          const errTexts = [...finalErrEls].map(e => e.textContent.trim()).filter(Boolean);
          debug = {
            via,
            widgetClicked,
            errCleared,
            errorTexts: errTexts.length ? errTexts : undefined,
            preSetValue: isDesig ? preSetValue : undefined,
            optValue: opt.value,
            optText: opt.textContent.trim(),
            domValue: el.value,
            domSelectedText: el.options[el.selectedIndex]?.textContent?.trim(),
            selectVisible: el.getClientRects().length > 0,
            selectOpacity: getComputedStyle(el).opacity,
            allOpts: opts.map(o => ({ v: o.value, t: o.textContent.trim() })),
            guideNodeClass: guideNode?.className || null,
            guideNodeHTML: guideNode ? guideNode.innerHTML.slice(0, 500) : null,
          };
          if (selNode) {
            debug.nodeId = selNode.id;
            debug.nodeValue = selNode.value;
            debug.nodeClass = selNode.className;
            debug.nodeProps = Object.keys(selNode).filter(k => typeof selNode[k] !== 'function').slice(0, 15);
            const enums = selNode.enum_ || selNode['enum'] || selNode.options;
            const enumNames = selNode.enumNames || selNode.optionNames;
            if (enums) debug.enums = Array.isArray(enums) ? enums : String(enums);
            if (enumNames) debug.enumNames = Array.isArray(enumNames) ? enumNames : String(enumNames);
          }
        } catch (_) {}
        const valid = took && !hasErr;
        results.push({ id: j.id, ok: valid, via, widgetClicked, errCleared, debug,
          err: !took ? `select shows "${el.options[el.selectedIndex]?.text}" instead of "${opt.text}"`
            : hasErr ? `MCA still reports a designation error after re-selecting "${opt.text}"` : null });
        continue;
      }

      if (j.typeChars) {
        const done = j.doneSelector && document.querySelector(j.doneSelector);
        if (el.value.trim().toUpperCase() === j.value.toUpperCase() && done && done.value.trim()) {
          results.push({ id: j.id, ok: true, note: 'already loaded on page' });
          continue;
        }
        // Behave like a person typing: MCA's lookup listens on key events and leaving the field.
        el.focus();
        setNative(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        for (const ch of j.value) {
          const k = { key: ch, code: `Key${ch}`, bubbles: true };
          el.dispatchEvent(new KeyboardEvent('keydown', k));
          el.dispatchEvent(new KeyboardEvent('keypress', k));
          setNative(el, el.value + ch);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', k));
          await pause(15);
        }
        const want = j.value.toUpperCase();
        let picked = null;
        // Only search for type-ahead suggestions for CIN-style fields (which have a doneSelector).
        // DIN fields are regular inputs — they validate on blur, no suggestion to pick.
        if (j.doneSelector) {
          for (let t = 0; t < 10 && !picked; t++) {
            await pause(250);
            const has = n => (n.textContent || '').toUpperCase().includes(want);
            picked = [...document.querySelectorAll('li, a, [role="option"], .ui-menu-item, .ui-menu-item-wrapper, div, span, td')]
              .filter(n => n !== el && !n.contains(el) && n.childElementCount < 4 && n.getClientRects().length
                && has(n) && ![...n.children].some(has))[0] || null;
          }
          if (picked) {
            for (const t of ['mouseover', 'mousedown', 'mouseup', 'click'])
              picked.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
            await pause(300);
          } else {
            // Fallback: press Down arrow to highlight first suggestion, then Enter to confirm.
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true }));
            await pause(200);
            el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            await pause(500);
          }
        }
        setModel(el, j.value);
        el.dispatchEvent(new Event('change', { bubbles: true }));
        // Simulate Tab key to leave the field — MCA validates DIN on blur/tab.
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true }));
        el.blur();
        el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        if ($) { try { $(el).trigger('keyup').trigger('change').trigger('blur').trigger('focusout'); } catch (_) {} }
        let okCin = el.value.toUpperCase().includes(want);
        // Check → fill → check: if CIN didn't take, clear and retry once.
        if (!okCin && j.doneSelector) {
          await pause(500);
          el.focus();
          setNative(el, '');
          el.dispatchEvent(new Event('input', { bubbles: true }));
          await pause(200);
          for (const ch of j.value) {
            const k2 = { key: ch, code: `Key${ch}`, bubbles: true };
            el.dispatchEvent(new KeyboardEvent('keydown', k2));
            el.dispatchEvent(new KeyboardEvent('keypress', k2));
            setNative(el, el.value + ch);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', k2));
            await pause(15);
          }
          await pause(400);
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true }));
          await pause(150);
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          await pause(500);
          setModel(el, j.value);
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.blur();
          okCin = el.value.toUpperCase().includes(want);
        }
        results.push({ id: j.id, ok: okCin, note: picked ? 'picked MCA suggestion' : undefined,
          err: okCin ? null : `field shows "${el.value}"` });
        if (j.waitAfterMs) await pause(j.waitAfterMs);
        continue;
      }

      if (j.kind === 'date') {
        // Always type dates key-by-key so MCA's datepicker event handlers fire on each keystroke.
        el.focus();
        setNative(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        for (const ch of j.value) {
          const k = { key: ch, code: ch >= '0' && ch <= '9' ? `Digit${ch}` : 'Slash', bubbles: true };
          el.dispatchEvent(new KeyboardEvent('keydown', k));
          el.dispatchEvent(new KeyboardEvent('keypress', k));
          setNative(el, el.value + ch);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', k));
          await pause(10);
        }
        // Dismiss any picker, then Tab out like a real user to commit the value.
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
        await pause(100);
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true }));
        fire(el);
        setModel(el, j.value);
        await pause(400);
      } else {
        const viaModel = setModel(el, j.value);
        if (!viaModel) el.focus();
        setNative(el, j.value);
        fire(el);
        await pause(150);
      }
      const digits = s => String(s).replace(/\.0+$/, '').replace(/[^\d\-]/g, '');
      const took = el.value === j.value || (el.value !== '' && digits(el.value) === digits(j.value));
      results.push({ id: j.id, ok: took, via: j.kind === 'date' ? 'typed' : 'dom',
        err: took ? null : `page rejected value (now "${el.value}")` });
    } catch (e) {
      results.push({ id: j.id, ok: false, err: e.message });
    }
  }
  } finally {
    await pause(150); // let AEM rules triggered by the field finish while dialogs are still muted
    Object.assign(window, saved);
  }
  return { results, dialogs };
}

// Returns the fields whose value no longer matches what was filled.
async function pageVerify(jobs) {
  await new Promise(r => setTimeout(r, 2000));
  const norm = s => String(s || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  const digits = s => String(s).replace(/\.0+$/, '').replace(/[^\d\-]/g, '');
  const out = [];
  for (const j of jobs) {
    if (j.kind === 'radio') {
      const on = [...document.querySelectorAll('input[type="radio"]')].find(r => r.name === j.name && r.checked);
      const now = on ? (on.getAttribute('aria-label') || on.value) : '';
      if (norm(now) !== norm(j.value)) out.push({ id: j.id, want: j.value, now: now || 'nothing selected' });
      continue;
    }
    const el = document.querySelectorAll(j.selector)[j.index || 0];
    if (!el) { out.push({ id: j.id, want: j.value, now: 'field gone' }); continue; }
    if (el.tagName === 'SELECT') {
      const selText = el.options[el.selectedIndex]?.text?.trim() || '';
      if (!el.value || (norm(selText) !== norm(j.value) && norm(el.value) !== norm(j.value))) {
        out.push({ id: j.id, want: j.value, now: selText || 'nothing selected' });
      }
      continue;
    }
    if (el.value !== j.value && digits(el.value) !== digits(j.value)) out.push({ id: j.id, want: j.value, now: el.value || 'empty' });
  }
  return out;
}

// Clicks the Nth visible "Save" button (one per form section) and reports any dialog MCA raises.
async function pageSave(index) {
  const dialogs = [];
  const saved = { alert: window.alert, confirm: window.confirm };
  window.alert = m => { dialogs.push({ type: 'alert', msg: String(m) }); };
  window.confirm = m => { dialogs.push({ type: 'confirm', msg: String(m) }); return true; };
  try {
    const buttons = [...document.querySelectorAll('button, input[type="button"], input[type="submit"]')]
      .filter(b => /^\s*save\s*$/i.test(b.textContent || b.value || '') && b.offsetParent !== null);
    const btn = buttons[index];
    if (!btn) return { clicked: false, found: buttons.length, dialogs };
    btn.scrollIntoView({ block: 'center' });
    btn.click();
    await new Promise(r => setTimeout(r, 2000));
    return { clicked: true, found: buttons.length, dialogs };
  } finally {
    Object.assign(window, saved);
  }
}

async function ensureInjected(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    if (res && res.pong) return;
  } catch (_) { /* fall through and inject */ }
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    files: ['content_script.js']
  });
  // small wait for listener to register
  await new Promise(r => setTimeout(r, 150));
}

/* ---------- PDF (ad-hoc) ---------- */
function bindPdf() {
  document.getElementById('extractBtn').addEventListener('click', async () => {
    const f = document.getElementById('pdfInput').files[0];
    if (!f) return showMessage('error', 'Pick a PDF first.');
    try {
      const raw = await PDFExtractor.extractText(f);
      document.getElementById('pdfRaw').textContent = raw.slice(0, 50000);
      showMessage('success', `Extracted ${raw.length} chars.`);
      await Storage.saveLogs({ action: 'pdfExtract', chars: raw.length });
    } catch (e) {
      showMessage('error', `Extract failed: ${e.message}`);
    }
  });
}

/* ---------- Debug ---------- */
let lastScan = null;
function bindDebug() {
  document.getElementById('scanBtn').addEventListener('click', async () => {
    const tab = await getActiveMcaTab();
    if (!tab) {
      document.getElementById('scanOut').textContent =
        'Active tab is not on mca.gov.in. Open the AOC-4 form tab, then click Scan again.';
      return;
    }
    try {
      await ensureInjected(tab.id);
      const res = await chrome.tabs.sendMessage(tab.id, { action: 'getFormFields' });
      lastScan = res?.fields || res;
      const summary = `URL: ${lastScan.url}\nIn iframe: ${lastScan.inFrame}\nFrames on page: ${lastScan.frames}\nTotal inputs seen: ${lastScan.totalInputs}\nFields reported: ${lastScan.fields?.length ?? 0}`;
      document.getElementById('scanSummary').textContent = summary;
      document.getElementById('scanSummary').classList.remove('hidden');
      document.getElementById('scanOut').textContent = JSON.stringify(lastScan, null, 2);
      await Storage.saveLogs({ action: 'scan', url: lastScan.url, total: lastScan.totalInputs });
    } catch (e) {
      document.getElementById('scanOut').textContent =
        `Content script unreachable: ${e.message}\n\n` +
        `Likely causes:\n` +
        `  1. Form is in an iframe on a subdomain the manifest does not match.\n` +
        `  2. The page URL does not match host_permissions.\n` +
        `  3. Extension needs a page reload (Ctrl+F5 on MCA tab).`;
    }
  });

  document.getElementById('copyScanBtn').addEventListener('click', async () => {
    if (!lastScan) return showMessage('error', 'Scan first.');
    await navigator.clipboard.writeText(JSON.stringify(lastScan, null, 2));
    showMessage('success', 'Copied to clipboard.');
  });
}

/* ---------- Logs ---------- */
function bindLogs() {
  document.getElementById('refreshLogs').addEventListener('click', refreshLogs);
  document.getElementById('clearLogs').addEventListener('click', async () => {
    await Storage.clearLogs();
    refreshLogs();
  });
}
async function refreshLogs() {
  const logs = await Storage.getLogs();
  document.getElementById('logView').textContent =
    logs.length ? logs.map(l => JSON.stringify(l)).join('\n') : '(empty)';
}

/* ---------- Helpers ---------- */
function showMessage(type, text, ms = 6000) {
  const el = document.getElementById('message');
  el.className = `msg ${type}`;
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(showMessage._t);
  showMessage._t = setTimeout(() => el.classList.add('hidden'), ms);
}

window.addEventListener('error', e => showMessage('error', `❌ Popup error: ${e.message}`, 20000));
window.addEventListener('unhandledrejection', e => showMessage('error', `❌ Popup error: ${e.reason?.message || e.reason}`, 20000));
function updateProgress(cur, total) {
  const pct = total ? Math.round((cur / total) * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressText').textContent = `${cur} / ${total}`;
}
function displayFieldList(data) {
  const ul = document.getElementById('fieldList');
  ul.innerHTML = '';
  const phase = currentPhase();
  document.getElementById('previewTitle').textContent = phase.label;
  for (const m of phaseFields(phase.id)) {
    const v = data[m.key];
    const has = v !== undefined && v !== null && v !== '';
    const status = has ? (m.onlyIfEmpty ? 'if empty' : 'fill') : 'skip';
    const cls = has ? (m.onlyIfEmpty ? 'skipped' : 'filled') : 'empty';
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="fname">${escape(m.label || m.key)}</span>
      <span class="fval" title="${escape(v == null ? '' : v)}">${has ? escape(v) : '—'}</span>
      <span class="fstat ${cls}">${status}</span>`;
    ul.appendChild(li);
  }
}
function escape(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
