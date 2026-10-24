
(function() {
  var storageKey = document.currentScript?.dataset.storageKey || 'theme';
  var darkFavicon = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%231a1a2e'/><path d='M8 10l6 5-6 5' stroke='%23e2e8f0' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/><line x1='16' y1='22' x2='24' y2='22' stroke='%23e2e8f0' stroke-width='2.5' stroke-linecap='round'/></svg>";
  var lightFavicon = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%23f1f5f9'/><path d='M8 10l6 5-6 5' stroke='%231e293b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/><line x1='16' y1='22' x2='24' y2='22' stroke='%231e293b' stroke-width='2.5' stroke-linecap='round'/></svg>";

  function updateFavicon(isDark) {
    var link = document.getElementById('dynamic-favicon');
    if (link) link.setAttribute('href', isDark ? darkFavicon : lightFavicon);
  }

  function applyTheme() {
    var savedTheme;
    try { savedTheme = localStorage.getItem(storageKey); } catch {}
    var theme = savedTheme ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    try { localStorage.setItem(storageKey, theme); } catch {}
    updateFavicon(isDark);
  }
  applyTheme();

  if (window.__blogThemeBound) return;
  window.__blogThemeBound = true;
  // Listen for theme changes from ThemeToggle component
  new MutationObserver(function() {
    updateFavicon(document.documentElement.classList.contains('dark'));
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  // Preserve theme across View Transitions
  document.addEventListener('astro:before-swap', function(e) {
    var isDark = document.documentElement.classList.contains('dark');
    e.newDocument.documentElement.classList.toggle('dark', isDark);
  });
})();
