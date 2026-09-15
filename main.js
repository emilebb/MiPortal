document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('themeToggle');
  const navToggleBtn = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');

  // 1. Funcionalidad de Modo Oscuro
  themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeToggleBtn.textContent = isDark ? '☀️' : '🌙';
  });

  // 2. Menú Desplegable Móvil
  navToggleBtn.addEventListener('click', () => {
    mainNav.classList.toggle('open');
  });
});