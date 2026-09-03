// Enregistrement du service worker · rend le site installable en application.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./sw.js").catch(function () {
      /* contexte non sécurisé ou navigateur sans support : le site reste utilisable */
    });
  });
}

// Notifications push : abonnement de l'appareil (appelé par les pages connectées).
// saveSub(subscriptionBody) doit enregistrer l'abonnement côté backend et renvoyer une promesse.
window.ctaEnablePush = function (partnerId, saveSub) {
  function b64ToUint8(base64) {
    var padding = "=".repeat((4 - (base64.length % 4)) % 4);
    var raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  var key = (window.CTA_CONFIG || {}).vapidPublicKey;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || !key) {
    return Promise.reject(new Error("Notifications non prises en charge sur cet appareil / navigateur."));
  }
  return Notification.requestPermission().then(function (perm) {
    if (perm !== "granted") throw new Error("Autorisation refusée : activez les notifications dans les réglages du navigateur.");
    return navigator.serviceWorker.ready;
  }).then(function (reg) {
    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToUint8(key)
    });
  }).then(function (sub) {
    var j = sub.toJSON();
    return saveSub({
      partner_id: partnerId,
      endpoint: sub.endpoint,
      p256dh: j.keys.p256dh,
      auth: j.keys.auth
    });
  });
};
