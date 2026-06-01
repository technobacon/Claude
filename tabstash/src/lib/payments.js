// lib/payments.js
//
// The single seam between TabStash and its payment provider.
//
// HOW IT SHIPS TODAY (development mode):
//   isPaid() reads a local flag from chrome.storage. You can flip it from the
//   extension's service-worker console to test the paid experience:
//       chrome.storage.local.set({ 'tabstash:paid': true })
//
// HOW TO MAKE IT REAL (one-time $3 purchase) — see NEXT_STEPS.txt:
//   1. Create an account at https://extensionpay.com and register an extension.
//      Set it to a ONE-TIME payment of $3 (ExtensionPay settles via Stripe).
//   2. Download ExtPay.js into this folder (src/lib/ExtPay.js) and add the
//      provider's domains to manifest.json `host_permissions`.
//   3. Replace the two marked sections below with the ExtPay calls. The rest of
//      the codebase only ever calls isPaid()/openPurchaseFlow(), so nothing
//      else has to change.

const PAID_FLAG = 'tabstash:paid';

/**
 * @returns {Promise<boolean>} whether the one-time purchase has been made.
 */
export async function isPaid() {
  // --- REPLACE FOR PRODUCTION -------------------------------------------
  //   const extpay = ExtPay('your-extension-id');
  //   const user = await extpay.getUser();
  //   return user.paid;
  // ----------------------------------------------------------------------
  const out = await chrome.storage.local.get(PAID_FLAG);
  return Boolean(out[PAID_FLAG]);
}

/**
 * Open the checkout/payment window. In dev this is a no-op that just explains
 * how to simulate a purchase.
 */
export async function openPurchaseFlow() {
  // --- REPLACE FOR PRODUCTION -------------------------------------------
  //   const extpay = ExtPay('your-extension-id');
  //   extpay.openPaymentPage();
  // ----------------------------------------------------------------------
  console.info(
    '[TabStash] Dev build: simulate a purchase with',
    "chrome.storage.local.set({ 'tabstash:paid': true })",
  );
}

/** Test helper for dev builds only. */
export async function setPaidForDev(value) {
  await chrome.storage.local.set({ [PAID_FLAG]: Boolean(value) });
}
