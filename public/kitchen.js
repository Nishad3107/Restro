(function () {
  const main = document.querySelector('main.shell');
  const orders = document.getElementById('orders');
  if (!main || !orders) return;

  const toolbar = document.createElement('div');
  toolbar.className = 'kitchen-toolbar';
  toolbar.innerHTML = '<div><span class="kitchen-kicker">Live kitchen queue</span><strong id="kitchenQueueStatus">Waiting for orders</strong></div><div class="kitchen-toolbar-actions"><span id="kitchenOrderCount" class="kitchen-order-count">0 active</span><button id="soundToggle" class="sound-toggle" type="button">Enable sound</button></div>';
  main.insertBefore(toolbar, document.getElementById('loginPanel'));

  const notice = document.createElement('div');
  notice.id = 'kitchenNotice';
  notice.className = 'kitchen-notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.hidden = true;
  main.insertBefore(notice, document.getElementById('loginPanel'));

  const timerStarts = new Map();
  const knownOrders = new Set();
  let initialized = false;
  let soundEnabled = false;
  let audioContext = null;

  function orderId(card) {
    return (card.querySelector('.muted')?.textContent || '').split(' · ')[0].trim();
  }

  function showNotice(message) {
    notice.textContent = message;
    notice.hidden = false;
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(() => { notice.hidden = true; }, 5000);
  }

  function beep() {
    if (!soundEnabled) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = 740;
      gain.gain.setValueAtTime(.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.12, audioContext.currentTime + .02);
      gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .45);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + .45);
    } catch (error) {
      console.warn('Kitchen sound notification unavailable:', error);
    }
  }

  function formatTimer(start) {
    const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const seconds = String(elapsed % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function decorate() {
    const cards = [...orders.querySelectorAll('.card')];
    const activeCards = cards.filter(card => orderId(card));
    document.getElementById('kitchenOrderCount').textContent = `${activeCards.length} active`;
    document.getElementById('kitchenQueueStatus').textContent = activeCards.length ? 'Orders need attention' : 'Waiting for orders';
    activeCards.forEach(card => {
      const id = orderId(card);
      if (!timerStarts.has(id)) timerStarts.set(id, Date.now());
      card.classList.add('kitchen-order-card');
      const status = card.querySelector('h2')?.textContent?.trim() || '';
      card.dataset.status = status.toLowerCase().replace(/[^a-z]+/g, '-');
      const meta = card.querySelector('.muted');
      if (meta) {
        const tableText = meta.textContent.split(' · ').find(value => value.toLowerCase().startsWith('table')) || 'Table —';
        if (!card.querySelector('.kitchen-table-number')) {
          const table = document.createElement('div');
          table.className = 'kitchen-table-number';
          table.textContent = tableText;
          card.prepend(table);
        }
      }
      const muted = card.querySelectorAll('.muted');
      const instructions = muted[muted.length - 1];
      if (instructions && instructions.textContent.trim() !== 'No special instructions') instructions.classList.add('special-instruction');
      if (!card.querySelector('.prep-timer')) {
        const timer = document.createElement('div');
        timer.className = 'prep-timer';
        timer.innerHTML = '<span>Prep time</span><strong data-prep-timer></strong>';
        card.insertBefore(timer, card.querySelector('.btn') || null);
      }
      const timer = card.querySelector('[data-prep-timer]');
      if (timer) timer.textContent = formatTimer(timerStarts.get(id));
      const button = card.querySelector('[data-order]');
      if (button) {
        const labels = { ORDER_ACCEPTED: 'Start Preparing', PREPARING: 'Mark Ready', READY: 'Mark Served', ORDER_PLACED: 'Accept Order' };
        button.textContent = labels[button.dataset.next] || button.dataset.next;
        button.classList.add('kitchen-primary-action');
      }
      if (!initialized && id) knownOrders.add(id);
      if (initialized && id && !knownOrders.has(id)) {
        knownOrders.add(id);
        card.classList.add('new-kitchen-order');
        showNotice(`New order received: ${id}`);
        beep();
      }
    });
    initialized = true;
  }

  document.getElementById('soundToggle').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    if (soundEnabled) {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
    }
    document.getElementById('soundToggle').textContent = soundEnabled ? 'Sound on' : 'Enable sound';
    document.getElementById('soundToggle').classList.toggle('enabled', soundEnabled);
  });
  new MutationObserver(decorate).observe(orders, { childList: true });
  window.setInterval(decorate, 1000);
  decorate();
}());
