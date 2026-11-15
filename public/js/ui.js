document.addEventListener('DOMContentLoaded', () => {
  const button = document.querySelector('#mobileMenuBtn');
  const menu = document.querySelector('#navMenu');
  if (!button || !menu) return;

  const mobile = window.matchMedia('(max-width: 980px)');
  const setOpen = (open) => {
    menu.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
  };

  button.addEventListener('click', () => {
    setOpen(button.getAttribute('aria-expanded') !== 'true');
  });

  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target) && !button.contains(event.target)) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      button.focus();
    }
  });

  menu.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });

  mobile.addEventListener('change', () => setOpen(false));
});
