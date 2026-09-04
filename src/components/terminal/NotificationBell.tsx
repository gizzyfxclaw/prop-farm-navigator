import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "../../lib/notifications";

const TYPE_COLOR: Record<string, string> = {
  info: "oklch(var(--gz-p))",
  warning: "oklch(var(--gz-warn))",
  success: "oklch(var(--gz-pos))",
  error: "oklch(var(--gz-neg))",
};

export function NotificationBell() {
  const { notifications, permission, showPanel, togglePanel, requestPermission, markAsRead, clearAll, sendPushNotification } =
    useNotifications();
  const unreadCount = notifications.filter((n) => !n.read).length;
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // Sync local state with context
  useEffect(() => {
    setPanelOpen(showPanel);
  }, [showPanel]);

  // Close panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        togglePanel();
      }
    }
    if (!panelOpen) return undefined;
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [panelOpen, togglePanel]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={togglePanel}
        className="btn btn-ghost fx-press relative"
        style={{ padding: "0 8px" }}
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell size={13} />
        {unreadCount > 0 && (
          <span
            className="badge badge-danger absolute"
            style={{ top: -5, right: -6, padding: "1px 4px", fontSize: 8.5, lineHeight: 1.2 }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {showPanel && (
        <div
          className="panel fx-rise absolute right-0 top-full mt-2 w-80 z-50"
          style={{ maxHeight: 384, overflowY: "auto", scrollbarWidth: "thin" }}
        >
          <header className="panel-head" style={{ position: "sticky", top: 0, zIndex: 1 }}>
            <h3 className="panel-head-title">
              Notifications
              {unreadCount > 0 && (
                <span className="badge badge-info" style={{ marginLeft: 2 }}>
                  {unreadCount} NEW
                </span>
              )}
            </h3>
            <div className="flex items-center gap-1.5">
              {permission !== "granted" && (
                <button onClick={requestPermission} className="btn btn-ghost" style={{ height: 22, padding: "0 7px" }}>
                  Enable Push
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={clearAll} className="btn btn-danger" style={{ height: 22, padding: "0 7px" }}>
                  Clear
                </button>
              )}
            </div>
          </header>

          {permission !== "granted" && (
            <div
              className="px-3 py-2"
              style={{
                fontSize: 10.5,
                color: "oklch(var(--gz-warn))",
                background: "oklch(var(--gz-warn) / 0.10)",
                borderBottom: "var(--gz-hair) solid oklch(var(--gz-warn) / 0.22)",
              }}
            >
              Enable push to receive alerts on your phone.
            </div>
          )}

          <div className="panel-body-flush">
            {notifications.length === 0 ? (
              <div className="px-3 py-7 text-center mono-cap c-mut" style={{ fontSize: 10 }}>
                No notifications
              </div>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markAsRead(n.id)}
                  className="fx-hover w-full text-left px-3 py-2.5"
                  style={{
                    display: "block",
                    borderTop: "var(--gz-hair) solid oklch(var(--gz-p) / 0.09)",
                    background: n.read ? "transparent" : "oklch(var(--gz-p) / 0.06)",
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className="mt-1 flex-shrink-0"
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: TYPE_COLOR[n.type] ?? "oklch(var(--gz-mut))",
                        boxShadow: `0 0 6px ${TYPE_COLOR[n.type] ?? "transparent"}`,
                      }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="mono-cap truncate"
                          style={{ fontSize: 10.5, color: "oklch(var(--gz-txt))" }}
                        >
                          {n.title}
                        </span>
                        <span
                          className="font-mono c-mut flex-shrink-0"
                          style={{ fontSize: 9, fontVariantNumeric: "tabular-nums" }}
                        >
                          {new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="mt-0.5 c-mut" style={{ fontSize: 10.5, lineHeight: 1.45 }}>
                        {n.body}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {notifications.length === 0 && (
            <div className="px-3 py-2.5" style={{ borderTop: "var(--gz-hair) solid oklch(var(--gz-p) / 0.11)" }}>
              <button
                onClick={() => sendPushNotification("GizzyFx Test", "Notifications are working!")}
                className="btn btn-ghost w-full"
                style={{ height: 26 }}
              >
                Send test notification
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
