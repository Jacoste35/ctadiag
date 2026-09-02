// Enregistrement du service worker · rend le site installable en application.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./sw.js").catch(function () {
      /* contexte non sécurisé ou navigateur sans support : le site reste utilisable */
    });
  });
}
