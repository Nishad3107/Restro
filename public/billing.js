(function () {
  const app = document.getElementById('app');
  const sessions = document.getElementById('sessions');
  if (!app || !sessions) return;

  const toolbar = document.createElement('div');
  toolbar.className = 'billing-toolbar';
  toolbar.innerHTML = '<div><span class="billing-kicker">Front-of-house finance</span><strong>Open dining sessions</strong><p>Review the complete table ledger before closing a session.</p></div><div class="billing-toolbar-mark">IN SERVICE</div>';
  app.insertBefore(toolbar, sessions);

  const decorated = new WeakSet();
  const detailsCache = new Map();
  const money = value => `₹${Number(value || 0).toFixed(2)}`;
  const sessionIdFrom = card => card.querySelector('[data-session]')?.dataset.session || '';
  const showMessage = (text, good = false) => { const message = document.getElementById('message'); message.textContent = text; message.className = good ? 'success' : 'error'; };

  function toast(text, type = 'success') {
    let region = document.getElementById('billingToastRegion');
    if (!region) { region = document.createElement('div'); region.id = 'billingToastRegion'; region.className = 'toast-region'; document.body.appendChild(region); }
    const item = document.createElement('div'); item.className = `toast ${type}`; item.textContent = text; region.appendChild(item); window.setTimeout(() => item.remove(), 3600);
  }

  function timeline(status) {
    const stages = [['ACTIVE', 'Session active'], ['BILL_REQUESTED', 'Bill requested'], ['PAYMENT', 'Payment'], ['COMPLETED', 'Completed']];
    const current = status === 'COMPLETED' ? 3 : status === 'BILL_REQUESTED' ? 1 : 0;
    return `<ol class="billing-timeline">${stages.map((stage, index) => `<li class="${index < current ? 'done' : index === current ? 'current' : ''}"><span></span>${stage[1]}</li>`).join('')}</ol>`;
  }

  function printBill(card, data) {
    const printWindow = window.open('', '_blank', 'width=600,height=760');
    if (!printWindow) { toast('Allow pop-ups to print the bill.', 'error'); return; }
    const items = (data.orders || []).map(order => `<tr><td>${(order.items || []).map(item => `${item.name || 'Item'} × ${item.quantity || 1}`).join('<br>')}</td><td>${money(order.total)}</td></tr>`).join('');
    printWindow.document.write(`<!doctype html><title>${data.tableNumber || 'Table'} bill</title><style>body{color:#292722;font-family:Arial,sans-serif;margin:0 auto;max-width:520px;padding:32px}h1,h2{font-family:Georgia,serif}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #e4d9c9;padding:12px 0;vertical-align:top}td:last-child{text-align:right}footer{border-top:2px solid #292722;margin-top:24px;padding-top:18px;text-align:right}</style><h1>Restaurant bill</h1><p>Table ${data.tableNumber || data.tableId || '—'} · Session ${data.sessionId}</p><table>${items || `<tr><td>Session total</td><td>${money(data.total)}</td></tr>`}</table><footer><p>Subtotal: ${money(data.subtotal)}</p><p>Tax: ${money(data.tax)}</p><p>Service charge: ${money(data.serviceCharge)}</p><h2>Total: ${money(data.total)}</h2></footer>`);
    printWindow.document.close(); printWindow.focus(); printWindow.print();
  }

  async function loadDetails(card) {
    const sessionId = sessionIdFrom(card);
    if (!sessionId || typeof db === 'undefined') return;
    try {
      const location = db.collection('tenants').doc(tenantId).collection('locations').doc(locationId);
      const [sessionSnapshot, orderSnapshot, billSnapshot] = await Promise.all([
        location.collection('diningSessions').doc(sessionId).get(),
        location.collection('orders').where('sessionId', '==', sessionId).get(),
        location.collection('bills').where('sessionId', '==', sessionId).get()
      ]);
      const session = sessionSnapshot.data() || {};
      const data = { ...session, sessionId, orders: orderSnapshot.docs.map(doc => doc.data()), bill: billSnapshot.docs.length ? billSnapshot.docs[billSnapshot.docs.length - 1].data() : null };
      detailsCache.set(sessionId, data);
      const bill = data.bill || data;
      const details = card.querySelector('.bill-details');
      if (details) details.innerHTML = `<div class="bill-line"><span>Food subtotal</span><strong>${money(bill.subtotal)}</strong></div><div class="bill-line"><span>Tax</span><strong>${money(bill.tax)}</strong></div><div class="bill-line"><span>Service charge</span><strong>${money(bill.serviceCharge)}</strong></div><div class="bill-total"><span>Grand total</span><strong>${money(bill.total || data.total)}</strong></div>`;
      const items = card.querySelector('.bill-items');
      if (items) items.innerHTML = data.orders.length ? data.orders.flatMap(order => (order.items || []).map(item => `<li><span>${item.name || 'Item'} × ${item.quantity || 1}</span><strong>${money(Number(item.price || 0) * Number(item.quantity || 1))}</strong></li>`)).join('') : '<li>No order items found.</li>';
      const badge = card.querySelector('.payment-badge');
      if (badge) { const paymentStatus = bill.paymentStatus || data.paymentStatus || 'PENDING'; badge.textContent = paymentStatus; badge.className = `payment-badge ${String(paymentStatus).toLowerCase()}`; }
      const timelineNode = card.querySelector('.billing-timeline-wrap'); if (timelineNode) timelineNode.innerHTML = timeline(data.status || 'ACTIVE');
      const complete = card.querySelector('[data-complete-session]'); if (complete) complete.disabled = data.status === 'COMPLETED';
    } catch (error) { console.warn('Unable to load bill details:', error); }
  }

  function decorate() {
    sessions.querySelectorAll('.card').forEach(card => {
      const sessionId = sessionIdFrom(card); if (!sessionId) return;
      card.classList.add('billing-session-card');
      if (!decorated.has(card)) {
        decorated.add(card);
        const heading = card.querySelector('h2');
        const statusText = card.textContent.includes('BILL_REQUESTED') ? 'BILL_REQUESTED' : 'ACTIVE';
        card.insertAdjacentHTML('afterbegin', `<div class="billing-card-top"><span class="session-label">TABLE SESSION</span><span class="payment-badge pending">PENDING</span></div>`);
        card.insertAdjacentHTML('beforeend', `<div class="billing-timeline-wrap">${timeline(statusText)}</div><div class="bill-items-wrap"><span class="session-label">Order items</span><ul class="bill-items"><li>Loading session items…</li></ul></div><div class="bill-details"><div class="bill-line"><span>Food subtotal</span><strong>—</strong></div></div><div class="split-preview" data-split-preview></div><div class="billing-card-actions"><button class="btn secondary" type="button" data-print-bill>Print bill</button><button class="btn complete-session" type="button" data-complete-session>Complete session</button></div>`);
        const generate = card.querySelector('[data-session]');
        if (generate) {
          generate.textContent = 'Generate / refresh bill';
          const original = generate.onclick;
          generate.onclick = async event => { await original?.(event); await loadDetails(card); toast('Bill generated and session totals refreshed.'); };
        }
        const splitInput = card.querySelector('input[id^="split-"]');
        const feeInput = card.querySelector('input[id^="fee-"]');
        const updateSplit = () => { const data = detailsCache.get(sessionId) || {}; const total = Number(data.bill?.total || data.total || 0) + Number(feeInput?.value || 0); const parts = Math.max(1, Number(splitInput?.value || 1)); const each = total / parts; const preview = card.querySelector('[data-split-preview]'); if (preview) preview.textContent = `Split across ${parts} part${parts === 1 ? '' : 's'} · ${money(each)} each`; };
        splitInput?.addEventListener('input', updateSplit); feeInput?.addEventListener('input', updateSplit); updateSplit();
        card.querySelector('[data-print-bill]')?.addEventListener('click', () => printBill(card, detailsCache.get(sessionId) || { sessionId, tableNumber: heading?.textContent?.replace(/^Table\s*/i, '') }));
        card.querySelector('[data-complete-session]')?.addEventListener('click', async buttonEvent => { const button = buttonEvent.currentTarget; if (!confirm('Complete this session and release the table? Every order must be paid first.')) return; button.disabled = true; try { await fn().httpsCallable('completeDiningSession')({ tenantId, locationId, sessionId }); toast('Session completed. The table is now available.'); } catch (error) { button.disabled = false; toast(error.message || 'The session could not be completed.', 'error'); } });
      }
      loadDetails(card);
    });
  }
  new MutationObserver(decorate).observe(sessions, { childList: true });
  decorate();
}());
