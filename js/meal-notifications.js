// ═══════════════════════════════════════════
// MEAL NOTIFICATIONS
// ═══════════════════════════════════════════

var _mealNotifTimers = [];
var _mealNotifMidnightTimer = null;

function cancelMealNotifications() {
  _mealNotifTimers.forEach((t) => clearTimeout(t));
  _mealNotifTimers = [];
  if (_mealNotifMidnightTimer) {
    clearTimeout(_mealNotifMidnightTimer);
    _mealNotifMidnightTimer = null;
  }
}

function scheduleMealNotifications() {
  cancelMealNotifications();

  if (!state.mealNotificationsEnabled) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (!state.mealCategoriesEnabled || !state.mealCategories.length) return;

  const now = new Date();

  state.mealCategories.forEach((category) => {
    const timeStr = state.mealCategoryTimes[category];
    if (!timeStr) return;

    const [hours, minutes] = timeStr.split(":").map(Number);
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);

    const delay = target.getTime() - now.getTime();
    if (delay <= 0) return; // already passed today

    const timer = setTimeout(() => {
      if (!state.mealNotificationsEnabled) return;
      if (Notification.permission !== "granted") return;
      try {
        new Notification("Čas zaznamenat jídlo", {
          body: `Nezapomeňte zaznamenat: ${category}`,
          icon: "/icons/icon-192x192.png",
          tag: `meal-notif-${category}`,
          renotify: true,
        });
      } catch (e) {
        console.warn("Notification failed:", e);
      }
    }, delay);

    _mealNotifTimers.push(timer);
  });

  // Re-schedule shortly after midnight for the next day
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 30, 0);
  const midnightDelay = tomorrow.getTime() - now.getTime();
  _mealNotifMidnightTimer = setTimeout(() => {
    scheduleMealNotifications();
  }, midnightDelay);
}

async function requestAndEnableMealNotifications() {
  if (!("Notification" in window)) {
    showToast("Váš prohlížeč nepodporuje notifikace", 3000);
    return false;
  }

  if (Notification.permission === "denied") {
    showToast(
      "Notifikace jsou blokovány. Povolte je v nastavení prohlížeče.",
      4000,
    );
    return false;
  }

  if (Notification.permission !== "granted") {
    const result = await Notification.requestPermission();
    if (result !== "granted") {
      showToast("Povolení notifikací bylo zamítnuto", 3000);
      return false;
    }
  }

  scheduleMealNotifications();
  return true;
}
