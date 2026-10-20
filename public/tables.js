(function () {
  const tableGrid = document.getElementById('tables');
  const app = document.getElementById('app');
  if (!tableGrid || !app) return;

  const toolbar = document.createElement('div');
  toolbar.className = 'table-toolbar';
  toolbar.innerHTML = '<div><span class="table-kicker">Floor operations</span><strong id="tableSummary">0 tables</strong></div><div class="table-filters"><input id="tableSearch" type="search" placeholder="Search tables" aria-label="Search tables"><select id="tableFilter" aria-label="Filter tables"><option value="ALL">All statuses</option><option value="AVAILABLE">Available</option><option value="OCCUPIED">Occupied</option><option value="RESERVED">Reserved</option></select></div>';
  app.insertBefore(toolbar, tableGrid);

  const summary = document.createElement('div');
  summary.className = 'table-occupancy-summary';
  summary.innerHTML = '<div><span class="summary-dot available"></span><strong id="availableCount">0</strong><small>Available</small></div><div><span class="summary-dot occupied"></span><strong id="occupiedCount">0</strong><small>Occupied</small></div><div><span class="summary-dot reserved"></span><strong id="reservedCount">0</strong><small>Reserved</small></div>';
  app.insertBefore(summary, tableGrid);

  const modal = document.createElement('div');
  modal.className = 'qr-modal-backdrop';
  modal.hidden = true;
  modal.innerHTML = '<section class="qr-modal" role="dialog" aria-modal="true" aria-labelledby="qrModalTitle"><button class="qr-modal-close" type="button" aria-label="Close QR preview">×</button><span class="table-kicker">Table QR</span><h2 id="qrModalTitle">QR preview</h2><div id="qrModalImage" class="qr-modal-image"></div><p id="qrModalUrl" class="qr-modal-url"></p><div class="qr-modal-actions"><button class="btn" id="qrModalDownload" type="button">Download QR</button><button class="btn secondary" id="qrModalPrint" type="button">Print QR</button></div></section>';
  document.body.appendChild(modal);

  let activePreview = null;
  const closeModal = () => { modal.hidden = true; document.getElementById('qrModalImage').innerHTML = ''; activePreview = null; };
  modal.querySelector('.qr-modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) closeModal(); });

  function qrSource(tableId) {
    const holder = document.getElementById(`qr-${tableId}`);
    const generated = holder?.querySelector('img,canvas');
    if (!generated) return null;
    return { node: generated, src: generated.tagName === 'CANVAS' ? generated.toDataURL('image/png') : generated.src };
  }

  function openPreview(tableId, label) {
    const source = qrSource(tableId);
    if (!source?.src) { document.getElementById('message').textContent = 'Generate the QR code before opening a preview.'; return; }
    activePreview = { tableId, label, src: source.src };
    const image = document.getElementById('qrModalImage');
    image.innerHTML = `<img src="${source.src}" alt="QR code for ${label}">`;
    document.getElementById('qrModalTitle').textContent = `${label} QR code`;
    document.getElementById('qrModalUrl').textContent = `${location.origin}/index.html?tenant=${encodeURIComponent(new URLSearchParams(location.search).get('tenant') || 'royal-rasoi')}&location=${encodeURIComponent(new URLSearchParams(location.search).get('location') || 'main')}&table=${encodeURIComponent(tableId)}`;
    modal.hidden = false;
  }

  function printPreview() {
    if (!activePreview) return;
    const printWindow = window.open('', '_blank', 'width=520,height=680');
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><title>${activePreview.label} QR</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:40px;color:#292722}img{display:block;margin:24px auto;max-width:360px}h1{font-family:Georgia,serif}</style><h1>${activePreview.label}</h1><img src="${activePreview.src}" alt="QR code"><p>Scan to open the restaurant menu.</p>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }
  document.getElementById('qrModalDownload').addEventListener('click', () => {
    if (!activePreview) return;
    const link = document.createElement('a'); link.download = `${activePreview.tableId}-qr.png`; link.href = activePreview.src; link.click();
  });
  document.getElementById('qrModalPrint').addEventListener('click', printPreview);

  function applyFilters() {
    const search = document.getElementById('tableSearch').value.trim().toLowerCase();
    const filter = document.getElementById('tableFilter').value;
    tableGrid.querySelectorAll('.card[data-table-card]').forEach(card => {
      const matchesSearch = !search || card.dataset.tableSearch.includes(search);
      const matchesFilter = filter === 'ALL' || card.dataset.tableStatus === filter;
      card.hidden = !(matchesSearch && matchesFilter);
    });
  }
  document.getElementById('tableSearch').addEventListener('input', applyFilters);
  document.getElementById('tableFilter').addEventListener('change', applyFilters);

  function decorate() {
    const cards = [...tableGrid.querySelectorAll('.card')].filter(card => card.querySelector('[data-status]'));
    const counts = { AVAILABLE: 0, OCCUPIED: 0, RESERVED: 0 };
    cards.forEach(card => {
      const select = card.querySelector('[data-status]');
      const status = select.value || 'AVAILABLE';
      const heading = card.querySelector('h2')?.textContent || 'Table';
      counts[status] = (counts[status] || 0) + 1;
      card.dataset.tableCard = 'true';
      card.dataset.tableStatus = status;
      card.dataset.tableSearch = `${heading} ${status}`.toLowerCase();
      card.classList.add('table-layout-card', status.toLowerCase());
      if (!card.querySelector('.table-layout-shape')) {
        const shape = document.createElement('div'); shape.className = 'table-layout-shape'; shape.innerHTML = `<span>${heading.replace(/^Table\s*/i, '')}</span>`; card.prepend(shape);
      }
      if (!card.querySelector('[data-preview-qr]')) {
        const preview = document.createElement('button'); preview.type = 'button'; preview.className = 'btn secondary'; preview.dataset.previewQr = select.dataset.status; preview.textContent = 'Preview QR';
        preview.addEventListener('click', () => openPreview(select.dataset.status, heading));
        select.parentNode.insertBefore(preview, select);
      }
    });
    document.getElementById('availableCount').textContent = counts.AVAILABLE;
    document.getElementById('occupiedCount').textContent = counts.OCCUPIED;
    document.getElementById('reservedCount').textContent = counts.RESERVED;
    document.getElementById('tableSummary').textContent = `${cards.length} table${cards.length === 1 ? '' : 's'} · ${counts.OCCUPIED} occupied`;
    applyFilters();
  }
  new MutationObserver(decorate).observe(tableGrid, { childList: true });
  window.setInterval(decorate, 1200);
  decorate();
}());
