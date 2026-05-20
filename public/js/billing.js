// js/billing.js — Google Play Billing for Business Pro

let purchaseStore = null;

async function initGooglePlayBilling() {
  if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
    console.log('💸 Billing: Not running on Android');
    return;
  }

  try {
    const { CdvPurchase } = window.Capacitor.Plugins;
    purchaseStore = CdvPurchase.store;

    // Register the Pro Monthly product
    await purchaseStore.register({
      id: "pro_monthly_19_99",
      type: CdvPurchase.ProductType.PAID_SUBSCRIPTION,
      platform: CdvPurchase.Platform.GOOGLE_PLAY
    });

    // Handle successful purchase
    purchaseStore.when().verified(async (purchase) => {
      try {
        await apiPost('/owner/upgrade', {
          orderId: purchase.transactionId,
          productId: purchase.productId
        });
        showToast('🎉 Pro Tier Activated!', 'success');
        loadPage('owner-dashboard'); // Refresh dashboard
      } catch (e) {
        console.error(e);
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
    showToast('Billing not ready yet. Please restart the app.', 'error');
    return;
  }

  const product = purchaseStore.get("pro_monthly_19_99");
  if (product) {
    purchaseStore.order(product);
  } else {
    showToast('Product not found. Please try again later.', 'error');
  }
};

// Auto start billing after login
const originalInitPush = window.initPushAfterLogin;
window.initPushAfterLogin = function() {
  if (typeof originalInitPush === 'function') originalInitPush();
  setTimeout(initGooglePlayBilling, 1200);
};