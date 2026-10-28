// Scan-only. Filling runs from the popup via chrome.scripting in the page's MAIN world.
if (!window.__aocScanListener) {
  window.__aocScanListener = true;

  chrome.runtime.onMessage.addListener((req, _s, send) => {
    if (req.action === 'getFormFields') send({ fields: scanFormFields() });
    else if (req.action === 'ping') send({ pong: true, href: location.href });
  });
}

function scanFormFields() {
  const out = [];
  const nodes = document.querySelectorAll('input, select, textarea');
  nodes.forEach((el, i) => {
    if (el.type === 'hidden') return;
    let labelText = el.getAttribute('aria-label') || el.placeholder || '';
    if (!labelText && el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) labelText = lbl.textContent.trim();
    }
    if (!labelText && el.labels && el.labels[0]) labelText = el.labels[0].textContent.trim();
    if (!labelText) {
      const row = el.closest('tr, .form-row, .row, li, div');
      if (row) labelText = (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    }
    const tr = el.closest('tr');
    const rowText = tr ? (tr.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120) : null;
    out.push({
      idx: i, rowText, tag: el.tagName.toLowerCase(), type: el.type || null,
      name: el.name || null, id: el.id || null,
      ariaLabel: el.getAttribute('aria-label') || null,
      placeholder: el.placeholder || null,
      label: (labelText || '').slice(0, 160)
    });
  });
  return { url: location.href, inFrame: window !== window.top, frames: window.frames.length, totalInputs: nodes.length, fields: out };
}
