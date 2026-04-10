document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  checkAuth().then(() => {
    if (currentUser) loadPage('home');
  });
});