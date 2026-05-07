document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  checkAuth().then(() => {
    loadPage('home');
  });
  // ─── Note: native push (Capacitor/FCM) is intentionally NOT initialized here.
  // It is wired up in auth.js after login/register/checkAuth so it never fires
  // on startup, which would block the initial WebView paint on Android.
});