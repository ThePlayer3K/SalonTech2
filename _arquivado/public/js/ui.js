document.addEventListener('DOMContentLoaded', () => {
  const button = document.querySelector('#mobileMenuBtn');
  const links = document.querySelector('#navLinks');
  button?.addEventListener('click', () => {
    const open = links.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(open));
  });
});
