import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * GizzyFx Notification System
 *
 * Provides on-site notification display and browser push notifications
 * that reach the user's phone/desktop via the Notification API.
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
      new Notification("GizzyFx Notifications Enabled", {
        body: "You will now receive trade alerts and reminders.",
        icon: "/favicon.ico",
      });
    }
  }, []);

  const sendPushNotification = useCallback(
    (title: string, body: string) => {
      if (!("Notification" in window)) return;
      if (Notification.permission === "granted") {
        new Notification(title, {
          body,
          icon: "/favicon.ico",
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
