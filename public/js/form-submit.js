// Cada formulário de alteração pode ser enviado uma única vez até a navegação.
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== 'post' || event.defaultPrevented) return;
  if (form.dataset.submitting === 'true') {
    event.preventDefault();
    return;
  }
  form.dataset.submitting = 'true';
  form.setAttribute('aria-busy', 'true');
  form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach((button) => {
    button.disabled = true;
  });
});

// O navegador pode restaurar o formulário pelo cache ao voltar à página.
window.addEventListener('pageshow', () => {
  document.querySelectorAll('form[data-submitting="true"]').forEach((form) => {
    delete form.dataset.submitting;
    form.removeAttribute('aria-busy');
    form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach((button) => {
      button.disabled = false;
    });
  });
});
