"use client";
// Browser notifications while the tab is in the background. (Push notifications
// when the app is fully closed would need a service worker + VAPID keys — not included.)
export function notify(title: string, body: string, force = false) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (!force && document.visibilityState === "visible") return;
  try {
    const n = new Notification(title, { body, icon: "/icon.svg", tag: title });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
  }
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) return "unsupported" as const;
  if (Notification.permission === "granted") return "granted" as const;
  return Notification.requestPermission();
}
