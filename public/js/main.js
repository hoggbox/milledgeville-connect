document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  checkAuth();           // checks login first and removes blur if already logged in
});