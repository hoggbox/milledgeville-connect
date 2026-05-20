// js/billing.js
let purchaseStore = null;

async function initGooglePlayBilling() {
  if (!window.Capacitor?.isNativePlatform()) return;

  try {
    const { CdvPurchase } = window.Capacitor.Plugins;
    purchaseStore = CdvPurchase.store;

    await purchaseStore.register({
      id: "pro_monthly_19_99",           // ← MUST match Google Play
      type: CdvPurchase.ProductType.PAID_SUBSCRIPTION,
      platform: CdvPurchase.Platform.GOOGLE_PLAY
    });

    purchaseStore.when().verified(async (purchase) => {
      try {
        await apiPost('/owner/upgrade', {
          orderId: purchase.transactionId,
          productId: purchase.productId
        });
        showToast('🎉 Pro Tier Activated! 50 credits added.', 'success');
        loadPage('owner-dashboard');
      } catch (e) {
        showToast('Purchase successful but sync failed', 'error');
      }
      purchase.finish();
    });

    await purchaseStore.ready();
    console.log('✅ Google Play Billing Ready');
  } catch (err) {
    console.error('Billing init failed:', err);
  }
}

window.buyProTier = async function() {
  if (!purchaseStore) {
    showToast('Billing not ready. Rebuild APK.', 'error');
    return;
  }
  const product = purchaseStore.get("pro_monthly_19_99");
  if (product) purchaseStore.order(product);
  else showToast('Product not found', 'error');
};

// Auto-init after login
const originalInit = window.initPushAfterLogin;
window.initPushAfterLogin = function() {
  if (typeof originalInit === 'function') originalInit();
  setTimeout(initGooglePlayBilling, 1500);
};