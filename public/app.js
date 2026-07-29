// TreeBot Web UI — no-build SPA

const view = document.getElementById('view');
const toastEl = document.getElementById('toast');
const modalEl = document.getElementById('modal');
let toastTimer = null;

// ---------- helpers ----------

let authToken = localStorage.getItem('treebot_token') || '';
let userName = localStorage.getItem('treebot_username') || '';

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  if (userName) headers['X-User-Name'] = userName;
  const opts = { headers, ...options };
  if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
  const res = await fetch('/api' + path, opts);
  if (res.status === 401) {
    authToken = '';
    localStorage.removeItem('treebot_token');
    showLogin();
    const err = new Error('unauthorized');
    err.isAuth = true;
    throw err;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

function showLogin() {
  view.innerHTML = `
    <div class="card" style="margin-top:40px">
      <h3>🔒 Access Token</h3>
      <div class="sub" style="margin-bottom:6px">This TreeBot instance is protected. Enter the access token:</div>
      <input type="text" id="login-token" placeholder="Token" autocomplete="off">
      <button class="btn" id="login-btn">Unlock</button>
    </div>`;
  document.getElementById('login-btn').onclick = () => {
    authToken = document.getElementById('login-token').value.trim();
    localStorage.setItem('treebot_token', authToken);
    show(current);
  };
}

function toast(msg, isError = false, ms = 4000) {
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.className = isError ? 'error' : '';
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

function modal(html) {
  modalEl.innerHTML = `<div class="dialog">${html}</div>`;
  modalEl.classList.remove('hidden');
}
function closeModal() {
  modalEl.classList.add('hidden');
  modalEl.innerHTML = '';
}
modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(); });

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Strip WhatsApp markdown asterisks for display
function clean(msg) {
  return (msg || '').replace(/\*/g, '');
}

function loading() {
  view.innerHTML = '<div class="loading">Loading…</div>';
}

function errView(e) {
  view.innerHTML = `<div class="empty err">⚠️ ${esc(e.message)}</div>`;
}

// Action result -> toast (strip sync noise, keep it short)
function resultToast(res) {
  const msg = clean(res.message).replace(/\n?📊 Sync:.*$/s, '').trim();
  toast(msg, !res.ok, 5000);
  return msg;
}

// ---------- screens ----------

const screens = {};

screens.dashboard = async () => {
  loading();
  const [inventory, sections] = await Promise.all([
    api('/inventory'), api('/sections')
  ]);
  const allocData = await Promise.all(
    sections.map(s => api('/allocations/' + encodeURIComponent(s.id)))
  );

  let html = '<h2 class="section-title">Main Inventory</h2>';
  if (inventory.length === 0) {
    html += '<div class="empty">No stock yet — add some in the Stock tab.</div>';
  } else {
    const total = inventory.reduce((a, i) => a + i.quantity, 0);
    html += `<div class="card"><div class="row-flex"><h3>Total boxes</h3><strong>${total}</strong></div></div>`;
    html += inventory.map(i => `
      <div class="card">
        <div class="row-flex"><h3>${esc(i.request_key)}</h3><strong>${i.quantity}</strong></div>
        <div class="sub">${esc(i.species_name)}${i.short_key ? ' · ' + esc(i.short_key) : ''}</div>
      </div>`).join('');
  }

  html += '<h2 class="section-title">Sections</h2>';
  if (sections.length === 0) {
    html += '<div class="empty">No sections yet.</div>';
  } else {
    sections.forEach((s, idx) => {
      const allocs = allocData[idx];
      const target = allocs.reduce((a, x) => a + x.target_quantity, 0);
      const dropped = allocs.reduce((a, x) => a + x.dropped, 0);
      const pct = target > 0 ? Math.min(100, Math.round(dropped / target * 100)) : 0;
      const complete = target > 0 && dropped >= target;
      html += `
        <div class="card">
          <div class="row-flex">
            <h3>Section ${esc(s.id)}</h3>
            <span class="pill ${complete ? 'ok' : ''}">${dropped}/${target} ${complete ? '🎉' : ''}</span>
          </div>
          ${s.description ? `<div class="sub">${esc(s.description)}</div>` : ''}
          <div class="progress"><div class="${complete ? 'complete' : ''}" style="width:${pct}%"></div></div>
        </div>`;
    });
  }
  view.innerHTML = html;
};

screens.drop = async () => {
  loading();
  const sections = await api('/sections');
  if (sections.length === 0) {
    view.innerHTML = '<div class="empty">Create a section first (Sections tab).</div>';
    return;
  }

  view.innerHTML = `
    <div class="card">
      <h3>📦 Log a Drop</h3>
      <label for="d-section">Section</label>
      <select id="d-section">
        <option value="">Choose section…</option>
        ${sections.map(s => `<option value="${esc(s.id)}">${esc(s.id)}${s.description ? ' — ' + esc(s.description) : ''}</option>`).join('')}
      </select>
      <div id="d-key-wrap"></div>
      <div id="d-qty-wrap"></div>
    </div>`;

  const sectionSel = document.getElementById('d-section');
  const keyWrap = document.getElementById('d-key-wrap');
  const qtyWrap = document.getElementById('d-qty-wrap');

  sectionSel.onchange = async () => {
    keyWrap.innerHTML = '';
    qtyWrap.innerHTML = '';
    if (!sectionSel.value) return;
    const allocs = await api('/allocations/' + encodeURIComponent(sectionSel.value));
    const open = allocs.filter(a => a.dropped < a.target_quantity);
    if (open.length === 0) {
      keyWrap.innerHTML = '<div class="empty">No open allocations in this section.</div>';
      return;
    }
    keyWrap.innerHTML = `
      <label for="d-key">Request Key</label>
      <select id="d-key">
        ${open.map(a => `<option value="${esc(a.request_key)}" data-remaining="${a.target_quantity - a.dropped}">${esc(a.request_key)} (${a.target_quantity - a.dropped} left)</option>`).join('')}
      </select>`;
    renderQty();

    document.getElementById('d-key').onchange = renderQty;

    function renderQty() {
      const opt = document.getElementById('d-key').selectedOptions[0];
      const remaining = parseInt(opt?.dataset.remaining || '0', 10);
      qtyWrap.innerHTML = `
        <label>Quantity (max ${remaining})</label>
        <div class="stepper">
          <button type="button" id="d-minus">−</button>
          <input type="number" id="d-qty" value="1" min="1" max="${remaining}">
          <button type="button" id="d-plus">+</button>
        </div>
        <button class="btn" id="d-submit">Log Drop</button>`;

      const qty = document.getElementById('d-qty');
      document.getElementById('d-minus').onclick = () => { qty.value = Math.max(1, (parseInt(qty.value) || 1) - 1); };
      document.getElementById('d-plus').onclick = () => { qty.value = Math.min(remaining, (parseInt(qty.value) || 0) + 1); };

      document.getElementById('d-submit').onclick = async (e) => {
        const btn = e.target;
        btn.disabled = true;
        try {
          const q = parseInt(qty.value, 10);
          if (!Number.isInteger(q) || q <= 0) {
            toast('❌ Enter a valid quantity (whole number > 0)', true);
            btn.disabled = false;
            return;
          }
          const res = await api('/drops', {
            method: 'POST',
            body: {
              quantity: q,
              requestKey: document.getElementById('d-key').value,
              section: sectionSel.value
            }
          });
          const msg = resultToast(res);
          if (msg.includes('ALLOCATION COMPLETE')) toast('🎉 Allocation complete!', false, 6000);
          screens.drop();
        } catch (err) {
          toast(clean(err.message), true, 6000);
          btn.disabled = false;
        }
      };
    }
  };
};

screens.stock = async () => {
  loading();
  const [inventory, keys] = await Promise.all([api('/inventory'), api('/keys')]);

  let html = '<h2 class="section-title">Main Inventory</h2>';
  if (inventory.length === 0) {
    html += '<div class="empty">No stock yet.</div>';
  } else {
    html += `<div class="card"><table>
      <tr><th>Key</th><th>Species</th><th style="text-align:right">Qty</th></tr>
      ${inventory.map(i => `<tr><td>${esc(i.request_key)}</td><td>${esc(i.species_name)}</td><td style="text-align:right"><strong>${i.quantity}</strong></td></tr>`).join('')}
    </table></div>`;
  }

  html += `
    <div class="card">
      <h3>➕ Add Stock</h3>
      ${keys.length === 0 ? '<div class="empty">Add a request key first (Keys tab).</div>' : `
      <label for="s-key">Request Key</label>
      <select id="s-key">${keys.map(k => `<option value="${esc(k.request_key)}">${esc(k.request_key)} — ${esc(k.species_name)}</option>`).join('')}</select>
      <label for="s-qty">Quantity</label>
      <div class="stepper">
        <button type="button" id="s-minus">−</button>
        <input type="number" id="s-qty" value="10" min="1">
        <button type="button" id="s-plus">+</button>
      </div>
      <button class="btn" id="s-submit">Add Stock</button>`}
    </div>`;

  view.innerHTML = html;
  if (keys.length === 0) return;

  const qty = document.getElementById('s-qty');
  document.getElementById('s-minus').onclick = () => { qty.value = Math.max(1, (parseInt(qty.value) || 1) - 1); };
  document.getElementById('s-plus').onclick = () => { qty.value = (parseInt(qty.value) || 0) + 1; };
  document.getElementById('s-submit').onclick = async e => {
    e.target.disabled = true;
    const q = parseInt(qty.value, 10);
    if (!Number.isInteger(q) || q <= 0) {
      toast('❌ Enter a valid quantity (whole number > 0)', true);
      e.target.disabled = false;
      return;
    }
    try {
      resultToast(await api('/stock', {
        method: 'POST',
        body: { quantity: q, requestKey: document.getElementById('s-key').value }
      }));
      screens.stock();
    } catch (err) {
      toast(clean(err.message), true, 6000);
      e.target.disabled = false;
    }
  };
};

screens.allocations = async () => {
  loading();
  const [sections, keys] = await Promise.all([api('/sections'), api('/keys')]);
  const allocData = await Promise.all(sections.map(s => api('/allocations/' + encodeURIComponent(s.id))));

  let html = '<h2 class="section-title">Allocations</h2>';
  let any = false;
  sections.forEach((s, idx) => {
    const allocs = allocData[idx];
    if (allocs.length === 0) return;
    any = true;
    html += `<div class="card"><h3>Section ${esc(s.id)}</h3><table>
      <tr><th>Key</th><th style="text-align:right">Dropped</th><th style="text-align:right">Target</th><th></th></tr>
      ${allocs.map(a => `<tr>
        <td>${esc(a.request_key)}</td>
        <td style="text-align:right">${a.dropped}</td>
        <td style="text-align:right">${a.target_quantity}</td>
        <td style="text-align:right">${a.dropped === 0 ? `<button class="btn small danger" data-delalloc="${esc(s.id)}|${esc(a.request_key)}">✕</button>` : ''}</td>
      </tr>`).join('')}
    </table></div>`;
  });
  if (!any) html += '<div class="empty">No allocations set yet.</div>';

  html += `
    <div class="card">
      <h3>🎯 Set Allocation</h3>
      ${(sections.length === 0 || keys.length === 0) ? '<div class="empty">Need at least one section and one key.</div>' : `
      <label for="a-section">Section</label>
      <select id="a-section">${sections.map(s => `<option value="${esc(s.id)}">${esc(s.id)}</option>`).join('')}</select>
      <label for="a-key">Request Key</label>
      <select id="a-key">${keys.map(k => `<option value="${esc(k.request_key)}">${esc(k.request_key)} — ${esc(k.species_name)}</option>`).join('')}</select>
      <label for="a-qty">Target Quantity</label>
      <div class="stepper">
        <button type="button" id="a-minus">−</button>
        <input type="number" id="a-qty" value="50" min="1">
        <button type="button" id="a-plus">+</button>
      </div>
      <button class="btn" id="a-submit">Set Allocation</button>`}
    </div>`;

  view.innerHTML = html;
  if (sections.length === 0 || keys.length === 0) return;

  // Allocation delete buttons (quantity 0 = remove, only shown when no drops yet)
  view.querySelectorAll('[data-delalloc]').forEach(btn => {
    btn.onclick = async () => {
      const [section, requestKey] = btn.dataset.delalloc.split('|');
      btn.disabled = true;
      try {
        resultToast(await api('/allocations', {
          method: 'POST',
          body: { quantity: 0, requestKey, section }
        }));
        screens.allocations();
      } catch (err) {
        toast(clean(err.message), true, 6000);
        btn.disabled = false;
      }
    };
  });

  const qty = document.getElementById('a-qty');
  document.getElementById('a-minus').onclick = () => { qty.value = Math.max(1, (parseInt(qty.value) || 1) - 1); };
  document.getElementById('a-plus').onclick = () => { qty.value = (parseInt(qty.value) || 0) + 1; };
  document.getElementById('a-submit').onclick = async e => {
    e.target.disabled = true;
    const q = parseInt(qty.value, 10);
    if (!Number.isInteger(q) || q <= 0) {
      toast('❌ Enter a valid quantity (whole number > 0)', true);
      e.target.disabled = false;
      return;
    }
    try {
      resultToast(await api('/allocations', {
        method: 'POST',
        body: {
          quantity: q,
          requestKey: document.getElementById('a-key').value,
          section: document.getElementById('a-section').value
        }
      }));
      screens.allocations();
    } catch (err) {
      toast(clean(err.message), true, 6000);
      e.target.disabled = false;
    }
  };
};

screens.keys = async () => {
  loading();
  const [keys, species] = await Promise.all([api('/keys'), api('/species')]);

  let html = '<h2 class="section-title">Request Keys</h2>';
  if (keys.length === 0) {
    html += '<div class="empty">No request keys yet.</div>';
  } else {
    html += keys.map(k => `
      <div class="card">
        <div class="row-flex"><h3>${esc(k.request_key)}</h3>${k.short_key ? `<span class="pill">${esc(k.short_key)}</span>` : ''}</div>
        <div class="sub">${esc(k.species_name)}</div>
      </div>`).join('');
  }

  html += `
    <div class="card">
      <h3>🔑 Add Key</h3>
      <label for="k-key">Request Key</label>
      <input type="text" id="k-key" placeholder="gg-2024-068">
      <label for="k-species">Species</label>
      <input type="text" id="k-species" list="species-list" placeholder="Coyote Willow">
      <datalist id="species-list">${species.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>
      <label for="k-short">Short Key (optional)</label>
      <input type="text" id="k-short" placeholder="068">
      <button class="btn" id="k-submit">Add Key</button>
    </div>`;

  view.innerHTML = html;
  document.getElementById('k-submit').onclick = async e => {
    e.target.disabled = true;
    try {
      resultToast(await api('/keys', {
        method: 'POST',
        body: {
          requestKey: document.getElementById('k-key').value.trim(),
          species: document.getElementById('k-species').value.trim(),
          shortKey: document.getElementById('k-short').value.trim() || null
        }
      }));
      screens.keys();
    } catch (err) {
      toast(clean(err.message), true, 6000);
      e.target.disabled = false;
    }
  };
};

screens.sections = async () => {
  loading();
  const sections = await api('/sections');

  let html = '<h2 class="section-title">Sections</h2>';
  if (sections.length === 0) {
    html += '<div class="empty">No sections yet.</div>';
  } else {
    html += sections.map(s => `
      <div class="card" data-section="${esc(s.id)}">
        <div class="row-flex">
          <h3>Section ${esc(s.id)}</h3>
          <span>
            <button class="btn small secondary" data-edit="${esc(s.id)}">Edit</button>
            <button class="btn small danger" data-del="${esc(s.id)}">Delete</button>
          </span>
        </div>
        <div class="sub">${esc(s.description || 'No description')}</div>
        <div class="sub">Allocations: ${s.stats.allocations} · Drops: ${s.stats.drops} (${s.stats.totalDropped} boxes)</div>
      </div>`).join('');
  }

  html += `
    <div class="card">
      <h3>📍 Add Section</h3>
      <label for="sec-id">Section ID</label>
      <input type="text" id="sec-id" placeholder="6">
      <label for="sec-desc">Description (optional)</label>
      <input type="text" id="sec-desc" placeholder="North Field Plot 6">
      <button class="btn" id="sec-submit">Add Section</button>
    </div>`;

  view.innerHTML = html;

  document.getElementById('sec-submit').onclick = async e => {
    e.target.disabled = true;
    try {
      resultToast(await api('/sections', {
        method: 'POST',
        body: {
          section: document.getElementById('sec-id').value.trim(),
          description: document.getElementById('sec-desc').value.trim() || null
        }
      }));
      screens.sections();
    } catch (err) {
      toast(clean(err.message), true, 6000);
      e.target.disabled = false;
    }
  };

  view.querySelectorAll('[data-edit]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.edit;
      modal(`
        <h3>Edit Section ${esc(id)}</h3>
        <label for="edit-desc">Description</label>
        <input type="text" id="edit-desc">
        <div class="row">
          <button class="btn secondary" id="m-cancel">Cancel</button>
          <button class="btn" id="m-save">Save</button>
        </div>`);
      document.getElementById('m-cancel').onclick = closeModal;
      document.getElementById('m-save').onclick = async () => {
        try {
          resultToast(await api('/sections/' + encodeURIComponent(id), {
            method: 'PUT',
            body: { description: document.getElementById('edit-desc').value.trim() }
          }));
          closeModal();
          screens.sections();
        } catch (err) { toast(clean(err.message), true, 6000); }
      };
    };
  });

  view.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.del;
      // First call without confirm -> server returns 400 with the ⚠️ stats prompt
      let warnMessage;
      try {
        const warn = await api('/sections/' + encodeURIComponent(id), { method: 'DELETE' });
        warnMessage = warn.message;
      } catch (err) {
        if (err.status === 400 && err.message.includes('⚠️')) {
          warnMessage = err.message;
        } else if (err.status === 400 && err.message.includes('not found')) {
          toast(clean(err.message), true, 6000);
          return;
        } else {
          toast(clean(err.message), true, 6000);
          return;
        }
      }
      modal(`
        <h3>⚠️ Delete Section ${esc(id)}?</h3>
        <p>${esc(clean(warnMessage))}</p>
        <div class="row">
          <button class="btn secondary" id="m-cancel">Cancel</button>
          <button class="btn danger" id="m-confirm">Delete</button>
        </div>`);
      document.getElementById('m-cancel').onclick = closeModal;
      document.getElementById('m-confirm').onclick = async (e) => {
        e.target.disabled = true;
        try {
          resultToast(await api('/sections/' + encodeURIComponent(id) + '?confirmed=true', { method: 'DELETE' }));
          closeModal();
          screens.sections();
        } catch (err) { toast(clean(err.message), true, 6000); closeModal(); }
      };
    };
  });
};

screens.activity = async () => {
  loading();
  const logs = await api('/logs');

  let html = `
    <div class="card">
      <button class="btn" id="undo-btn">↩️ Undo Last Action</button>
    </div>
    <h2 class="section-title">Recent Activity</h2>`;

  if (logs.length === 0) {
    html += '<div class="empty">No activity yet.</div>';
  } else {
    html += `<div class="card"><table>
      <tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr>
      ${logs.map(l => `<tr>
        <td class="muted" style="white-space:nowrap">${esc((l.created_at || '').slice(5, 16))}</td>
        <td class="muted">${esc(l.user_phone)}</td>
        <td>${esc(l.action)}</td>
        <td>${[l.request_key, l.quantity ? '×' + l.quantity : '', l.section ? 'sec ' + l.section : ''].filter(Boolean).map(esc).join(' ')}</td>
      </tr>`).join('')}
    </table></div>`;
  }
  view.innerHTML = html;

  document.getElementById('undo-btn').onclick = async e => {
    e.target.disabled = true;
    try {
      resultToast(await api('/undo', { method: 'POST' }));
      screens.activity();
    } catch (err) {
      toast(clean(err.message), true, 6000);
      e.target.disabled = false;
    }
  };
};

screens.sheets = async () => {
  loading();
  const status = await api('/sheets/status');
  const conn = status.connection;

  let html = `
    <div class="card">
      <h3>Connection</h3>
      ${conn.connected
        ? `<div class="ok">✅ Connected</div><div class="sub">${esc(conn.spreadsheetTitle || '')}</div>`
        : `<div class="err">❌ Disconnected</div>${conn.error ? `<div class="sub">${esc(conn.error)}</div>` : ''}`}
    </div>
    <div class="card">
      <h3>Sync to Sheets</h3>
      <div class="sub" style="margin-bottom:8px">Last syncs:</div>
      ${status.sync.tabs.map(t => `<div class="sub">• ${esc(t.name)}: ${t.lastSync ? esc(new Date(t.lastSync).toLocaleString()) : 'never'}</div>`).join('')}
      <button class="btn" id="sync-all" ${conn.connected ? '' : 'disabled'}>🔄 Sync All</button>
    </div>
    <div class="card">
      <h3>Import from Sheets</h3>
      <div class="sub">Pulls Sheets data into the bot database (overwrites local data).</div>
      <button class="btn secondary" id="import-preview" ${conn.connected ? '' : 'disabled'}>Preview Import</button>
      <div id="import-area"></div>
    </div>`;

  view.innerHTML = html;

  document.getElementById('sync-all').onclick = async e => {
    e.target.disabled = true;
    e.target.textContent = 'Syncing…';
    try {
      resultToast(await api('/sync', { method: 'POST', body: {} }));
    } catch (err) { toast(clean(err.message), true, 6000); }
    screens.sheets();
  };

  document.getElementById('import-preview').onclick = async e => {
    e.target.disabled = true;
    e.target.textContent = 'Loading preview…';
    try {
      const res = await api('/import/preview', { method: 'POST', body: {} });
      renderImportPreview(res.preview);
    } catch (err) {
      toast(clean(err.message), true, 6000);
      e.target.disabled = false;
      e.target.textContent = 'Preview Import';
    }
  };

  function renderImportPreview(p) {
    const area = document.getElementById('import-area');
    const sections = [
      ['Request Keys', p.requestKeys], ['Sections', p.sections],
      ['Inventory', p.inventory], ['Allocations', p.allocations]
    ].filter(([, v]) => v);

    let h = '<h3 style="margin-top:14px">Preview</h3>';
    for (const [name, v] of sections) {
      h += `<div class="sub" style="margin-top:8px"><strong>${name}:</strong> ${v.new.length} new, ${v.updated.length} updated, ${v.unchanged.length} unchanged${v.errors.length ? ` · <span class="err">${v.errors.length} errors</span>` : ''}</div>`;
    }
    h += `
      <div class="row" style="display:flex;gap:10px">
        <button class="btn secondary" id="imp-cancel">Cancel</button>
        <button class="btn danger" id="imp-confirm">Apply Import</button>
      </div>`;
    area.innerHTML = h;

    document.getElementById('imp-cancel').onclick = async () => {
      await api('/import/cancel', { method: 'POST' });
      area.innerHTML = '';
      const btn = document.getElementById('import-preview');
      btn.disabled = false;
      btn.textContent = 'Preview Import';
    };
    document.getElementById('imp-confirm').onclick = async e2 => {
      e2.target.disabled = true;
      e2.target.textContent = 'Importing…';
      try {
        const res = await api('/import/confirm', { method: 'POST' });
        toast('✅ Import applied', false, 5000);
        screens.sheets();
      } catch (err) {
        toast(clean(err.message), true, 6000);
        screens.sheets();
      }
    };
  }
};

// ---------- user identity (name picker, no accounts) ----------

const badge = document.getElementById('user-badge');

function updateBadge() {
  if (userName) {
    badge.textContent = `👤 ${userName}`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function showNamePrompt() {
  view.innerHTML = `
    <div class="card" style="margin-top:40px">
      <h3>👤 What's your name?</h3>
      <div class="sub" style="margin-bottom:6px">Used to label your drops and undo your own actions. No password needed.</div>
      <input type="text" id="name-input" placeholder="e.g. Andrew" maxlength="40" autocomplete="off">
      <button class="btn" id="name-btn">Continue</button>
    </div>`;
  const input = document.getElementById('name-input');
  const save = () => {
    const v = input.value.trim();
    if (!v) { toast('❌ Please enter your name', true); return; }
    userName = v;
    localStorage.setItem('treebot_username', v);
    updateBadge();
    show(current);
  };
  document.getElementById('name-btn').onclick = save;
  input.onkeydown = e => { if (e.key === 'Enter') save(); };
  input.focus();
}

badge.onclick = () => { showNamePrompt(); };

// ---------- router ----------

const tabBtns = document.querySelectorAll('#tabs button');
let current = 'dashboard';

async function show(tab) {
  current = tab;
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  try {
    await screens[tab]();
  } catch (e) {
    if (e.isAuth) return; // login form already shown — don't overwrite it
    errView(e);
  }
}

tabBtns.forEach(b => { b.onclick = () => show(b.dataset.tab); });

updateBadge();
if (!userName) {
  showNamePrompt();
} else {
  show('dashboard');
}
