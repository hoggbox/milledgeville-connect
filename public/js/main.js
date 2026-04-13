document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  checkAuth().then(() => {
    loadPage('home');
  });
});