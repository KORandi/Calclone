// ═══════════════════════════════════════════
// OFFLINE INDICATOR
// ═══════════════════════════════════════════
(function initOfflineIndicator() {
  const banner = document.getElementById("offline-banner");
  let hideTimer = null;

  function updateOnlineStatus() {
    if (hideTimer) clearTimeout(hideTimer);
    if (!navigator.onLine) {
      banner.textContent = "Jste offline";
      banner.classList.remove("online");
      banner.classList.add("visible");
    } else {
      banner.textContent = "Zpátky online";
      banner.classList.add("online", "visible");
      hideTimer = setTimeout(() => {
        banner.classList.remove("visible", "online");
      }, 3000);
    }
  }

  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
  if (!navigator.onLine) updateOnlineStatus();
})();

// Register service worker with auto-update
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("sw.js")
    .then((reg) => {
      reg.addEventListener("updatefound", () => {
        const newSW = reg.installing;
        if (!newSW) return;
        newSW.addEventListener("statechange", () => {
          if (
            newSW.state === "activated" &&
            navigator.serviceWorker.controller
          ) {
            showToast("Nová verze dostupná — obnovte stránku", 5000);
          }
        });
      });
    })
    .catch(() => {});
  // Check for updates on every load
  navigator.serviceWorker.ready.then((reg) => reg.update());
}
