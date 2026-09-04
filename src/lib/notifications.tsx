import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * GizzyFx Notification System
 *
 * Provides on-site notification display and browser push notifications
 * that reach the user's phone/desktop via the Notification API.
 *
 * Uses ServiceWorkerRegistration.showNotification() when a service worker
 * is registered (required for Firefox / mobile Chrome / installed PWAs),
 * falling back to the Notification constructor in a try-catch for browsers
 * that still allow it.
 */

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: "info" | "warning" | "success" | "error";
  timestamp: number;
  read: boolean;
  data?: Record<string, unknown>;
}

interface NotificationState {
  notifications: NotificationItem[];
  permission: NotificationPermission;
  showPanel: boolean;
  requestPermission: () => Promise<void>;
  addNotification: (n: Omit<NotificationItem, "id" | "timestamp" | "read">) => void;
  markAsRead: (id: string) => void;
  clearAll: () => void;
  togglePanel: () => void;
  sendPushNotification: (title: string, body: string) => void;
}

const NotificationContext = createContext<NotificationState | null>(null);

export function useNotifications(): NotificationState {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be inside NotificationProvider");
  return ctx;
}

/** Show a browser notification — SW path if available, else fallback. */
async function showBrowserNotification(title: string, options: NotificationOptions) {
  // Prefer the service-worker path (Firefox, mobile Chrome, PWAs).
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return;
      }
    } catch {
      // fall through to constructor
    }
  }
  // Fallback: the Notification constructor. Wrap in try-catch because
  // some browsers (Firefox, mobile Chrome) forbid it entirely.
  try {
    new Notification(title, options);
  } catch {
    // Notifications unavailable — silent no-op.
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [showPanel, setShowPanel] = useState(false);

  // Check existing permission on mount
  useEffect(() => {
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Also surface stored notifications from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("gizzyfx.notifications");
      if (stored) {
        const parsed = JSON.parse(stored) as NotificationItem[];
        setNotifications(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist notifications
  useEffect(() => {
    localStorage.setItem("gizzyfx.notifications", JSON.stringify(notifications));
  }, [notifications]);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      alert("This browser does not support notifications");
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      await showBrowserNotification("GizzyFx Notifications Enabled", {
        body: "You will now receive trade alerts and reminders.",
        icon: "/favicon-32.png",
      });
    }
  }, []);

  const sendPushNotification = useCallback(
    (title: string, body: string) => {
      if (!("Notification" in window)) return;
      if (Notification.permission === "granted") {
        showBrowserNotification(title, {
          body,
          icon: "/favicon-32.png",
          tag: "gizzyfx-alert",
          requireInteraction: true,
        });
      }
    },
    [],
  );

  const addNotification = useCallback(
    (n: Omit<NotificationItem, "id" | "timestamp" | "read">) => {
      const item: NotificationItem = {
        ...n,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        timestamp: Date.now(),
        read: false,
      };
      setNotifications((prev) => [item, ...prev].slice(0, 50)); // keep last 50
      // Also push to browser notification
      sendPushNotification(n.title, n.body);
    },
    [sendPushNotification],
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    localStorage.removeItem("gizzyfx.notifications");
  }, []);

  const togglePanel = useCallback(() => {
    setShowPanel((p) => !p);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        permission,
        showPanel,
        requestPermission,
        addNotification,
        markAsRead,
        clearAll,
        togglePanel,
        sendPushNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
