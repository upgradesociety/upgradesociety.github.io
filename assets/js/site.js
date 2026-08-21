(() => {
  const body = document.body;
  const toggle = document.querySelector('.sidebar-toggle');
  const sidebar = document.querySelector('.book-sidebar');
  const scrim = document.querySelector('.sidebar-scrim');
  const search = document.querySelector('#sidebar-search');
  const navLinks = [...document.querySelectorAll('.book-nav a')];

  const closeSidebar = () => {
    body.classList.remove('sidebar-open');
    toggle?.setAttribute('aria-expanded', 'false');
    if (scrim) scrim.hidden = true;
  };

  toggle?.addEventListener('click', () => {
    const open = !body.classList.contains('sidebar-open');
    body.classList.toggle('sidebar-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (scrim) scrim.hidden = !open;
  });
  scrim?.addEventListener('click', closeSidebar);

  search?.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    navLinks.forEach((link) => {
      link.style.display = !q || link.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      search?.focus();
      search?.select();
    }
    if (event.key === 'Escape') closeSidebar();
  });
})();
