(function () {
  // Prefer long polling for Firestore on Safari and restaurant networks that
  // interrupt WebChannel connections. This must run before firebase.initializeApp.
  if (window.firebase && typeof window.firebase.initializeApp === 'function' && !window.__restroFirestoreTransportConfigured) {
    const initializeApp = window.firebase.initializeApp.bind(window.firebase);
    window.firebase.initializeApp = function (...args) {
      const app = initializeApp(...args);
      try { window.firebase.firestore().settings({ experimentalForceLongPolling: true }); }
      catch (error) { console.warn('Firestore transport fallback could not be configured.', error); }
      window.__restroFirestoreTransportConfigured = true;
      return app;
    };
  }

  const ui = {
    toast(message, type = 'success', duration = 3600) {
      let region = document.querySelector('.ui-toast-region');
      if (!region) { region = document.createElement('div'); region.className = 'ui-toast-region'; region.setAttribute('aria-live', 'polite'); document.body.appendChild(region); }
      const toast = document.createElement('div');
      toast.className = `ui-toast ui-toast-${type}`;
      toast.textContent = message;
      region.appendChild(toast);
      window.setTimeout(() => toast.remove(), duration);
    },
    setLoading(button, loading, loadingText = 'Working…') {
      if (!button) return;
      if (loading) { button.dataset.restroOriginalText = button.textContent; button.disabled = true; button.classList.add('is-loading'); button.textContent = loadingText; }
      else { button.disabled = false; button.classList.remove('is-loading'); button.textContent = button.dataset.restroOriginalText || button.textContent; }
    },
    money(value) { return `₹${Number(value || 0).toFixed(2)}`; },
    empty(message) { return `<div class="ui-empty">${message}</div>`; },
    error(message) { return `<div class="ui-error" role="alert">${message}</div>`; },
    loading(message = 'Loading…') { return `<div class="ui-loading" aria-live="polite">${message}</div>`; }
  };
  window.RestroUI = Object.freeze(ui);
}());
