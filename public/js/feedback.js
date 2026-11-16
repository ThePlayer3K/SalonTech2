function initFeedbackDialog() {
  const feedbackDialog = document.querySelector('#feedbackDialog');
  if (feedbackDialog) {
    feedbackDialog.querySelector('[data-feedback-close]').addEventListener('click', () => feedbackDialog.close());
    feedbackDialog.addEventListener('click', (event) => {
      if (event.target === feedbackDialog) feedbackDialog.close();
    });
    feedbackDialog.showModal();
  }
}

function initFieldValidation() {
  const errors = new Map();
  let nextErrorId = 0;
  let focusScheduled = false;

  function updateFieldError(field, clear = false) {
    if (!field.validity) return;
    let error = errors.get(field);
    if (clear || field.validity.valid) {
      if (!error) return;
      const descriptions = (field.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter((id) => id && id !== error.id);
      if (descriptions.length) {
        field.setAttribute('aria-describedby', descriptions.join(' '));
      } else {
        field.removeAttribute('aria-describedby');
      }
      field.removeAttribute('aria-invalid');
      error.remove();
      errors.delete(field);
      return;
    }
    if (!error) {
      error = document.createElement('p');
      do {
        error.id = `field-error-${++nextErrorId}`;
      } while (document.getElementById(error.id));
      error.className = 'field-error';
      error.setAttribute('aria-live', 'polite');
      field.insertAdjacentElement('afterend', error);
      errors.set(field, error);
      const description = field.getAttribute('aria-describedby');
      field.setAttribute('aria-describedby', [description, error.id].filter(Boolean).join(' '));
    }
    error.textContent = field.validationMessage;
    field.setAttribute('aria-invalid', 'true');
  }

  document.addEventListener('invalid', (event) => {
    event.preventDefault();
    updateFieldError(event.target);
    if (focusScheduled) return;
    focusScheduled = true;
    queueMicrotask(() => {
      focusScheduled = false;
      const first = event.target.form?.querySelector(':invalid') || event.target;
      // Campos inválidos podem estar dentro de uma edição recolhida.
      for (let parent = first.parentElement; parent; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS') parent.open = true;
      }
      first.focus();
    });
  }, true);

  for (const name of ['input', 'change']) {
    document.addEventListener(name, (event) => {
      if (errors.has(event.target)) updateFieldError(event.target);
    });
  }
  document.addEventListener('reset', (event) => {
    queueMicrotask(() => {
      if (event.defaultPrevented) return;
      for (const field of errors.keys()) {
        if (field.form === event.target) updateFieldError(field, true);
      }
    });
  });
}

function initConfirmations() {
  const dialog = document.querySelector('#confirmDialog');
  if (!dialog) return;
  const message = dialog.querySelector('#confirmMessage');
  let pending = null;
  let approvedForm = null;

  // A captura interrompe o envio antes do bloqueio de duplo clique.
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;
    if (approvedForm === form) {
      approvedForm = null;
      return;
    }
    if (!form.dataset.confirm) return;
    event.preventDefault();
    if (pending || form.dataset.submitting === 'true') return;
    pending = { form, submitter: event.submitter };
    message.textContent = form.dataset.confirm;
    dialog.showModal();
  }, true);

  dialog.querySelector('[data-confirm-cancel]').addEventListener('click', () => {
    pending = null;
    dialog.close();
  });
  dialog.addEventListener('cancel', () => { pending = null; });
  dialog.addEventListener('close', () => { if (!dialog.open) pending = null; });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      pending = null;
      dialog.close();
    }
  });
  function confirmSubmission() {
    if (!pending) return;
    const { form, submitter } = pending;
    pending = null;
    dialog.close();
    if (!form.isConnected) return;
    approvedForm = form;
    try {
      if (submitter && submitter.form === form && !submitter.disabled) {
        form.requestSubmit(submitter);
      } else {
        form.requestSubmit();
      }
    } finally {
      approvedForm = null;
    }
  }

  dialog.querySelector('[data-confirm-accept]').addEventListener('click', confirmSubmission);
}

document.addEventListener('DOMContentLoaded', () => {
  initFeedbackDialog();
  initFieldValidation();
  initConfirmations();
});
