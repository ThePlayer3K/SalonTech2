(() => {
  const storageKey = 'salontech-theme';
  const root = document.documentElement;

  function applyTheme(theme) {
    const dark = theme === 'dark';
    root.dataset.theme = dark ? 'dark' : 'light';
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.setAttribute('aria-pressed', String(dark));
      button.title = dark ? 'Desativar o modo escuro' : 'Ativar o modo escuro';
    });
  }

  let savedTheme;
  try { savedTheme = localStorage.getItem(storageKey); } catch {}
  // Executa antes do CSS para manter o tema escolhido ao trocar de página.
  applyTheme(savedTheme);

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(root.dataset.theme);
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(theme);
        try { localStorage.setItem(storageKey, theme); } catch {}
      });
    });
  });
})();
