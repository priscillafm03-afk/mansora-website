(() => {
  document.querySelector('.ss-skip')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    document.getElementById('product-main').focus();
  }, true);
  const form = document.getElementById('sales-stock-waitlist');
  if (!form) return;
  const button = form.querySelector('button[type="submit"]');
  const result = document.getElementById('waitlist-result');
  let busy = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    busy = true;
    button.disabled = true;
    button.textContent = 'Saving your request…';
    form.setAttribute('aria-busy', 'true');
    result.textContent = 'Saving your request…';
    result.className = 'ss-result';
    for (const field of ['name', 'email', 'business', 'consent']) {
      form.elements[field].removeAttribute('aria-invalid');
      document.getElementById(`waitlist-${field}-error`).textContent = '';
    }
    try {
      const response = await fetch(form.action, {
        method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!response.ok || data.ok !== true) {
        let first;
        for (const [field, message] of Object.entries(data.fields || {})) {
          if (!['name', 'email', 'business', 'consent'].includes(field)) continue;
          form.elements[field].setAttribute('aria-invalid', 'true');
          document.getElementById(`waitlist-${field}-error`).textContent = message;
          first ||= form.elements[field];
        }
        result.textContent = data.error || 'Your request could not be confirmed. Please try again later.';
        result.classList.add('ss-result-error');
        (first || result).focus();
        return;
      }
      result.textContent = data.message;
      result.classList.add('ss-result-success');
      form.reset();
      result.focus();
    } catch {
      result.textContent = 'We could not confirm that your request was saved. Please try again later. Repeating the form will not create a duplicate. You can also email priscilla@mansora-consulting.com.';
      result.classList.add('ss-result-error');
      result.focus();
    } finally {
      busy = false;
      button.disabled = false;
      button.innerHTML = 'Join the waiting list <span aria-hidden="true">→</span>';
      form.removeAttribute('aria-busy');
    }
  });
})();
