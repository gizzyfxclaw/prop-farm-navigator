import { useEffect, useRef, useState } from "react";
import { useNotifications } from "../../lib/notifications";

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
    if (panelOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [panelOpen, togglePanel]);

  const typeColors: Record<string, string> = {
    info: "oklch(var(--gz-p))",
    warning: "oklch(0.7 0.2 45)",
    success: "oklch(0.7 0.2 145)",
    error: "oklch(0.7 0.2 25)",
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={togglePanel}
        className="relative rounded-md border border-border/30 bg-secondary/30 p-1.5 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
        aria-label="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {showPanel && (
        <div
          className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-border/40 bg-card/95 backdrop-blur-xl shadow-2xl z-50"
          style={{ scrollbarWidth: "thin" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
            <h3 className="text-[13px] font-semibold text-foreground">Notifications</h3>
            <div className="flex items-center gap-2">
              {permission !== "granted" && (
                <button
                  onClick={requestPermission}
                  className="rounded-md bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-all"
                >
                  Enable Push
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="rounded-md bg-destructive/10 px-2 py-1 text-[10px] font-semibold text-destructive hover:bg-destructive/20 transition-all"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Permission hint */}
          {permission !== "granted" && (
            <div className="border-b border-border/20 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-400">
              Click "Enable Push" to get alerts on your phone
            </div>
          )}

          {/* Notifications list */}
          <div className="divide-y divide-border/20">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <div
                  key={n.id}
                  onClick={() => markAsRead(n.id)}
                  className={`cursor-pointer px-4 py-3 hover:bg-secondary/30 transition-all ${!n.read ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-1 h-2 w-2 rounded-full flex-shrink-0"
                      style={{ background: typeColors[n.type] }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-medium text-foreground truncate">{n.title}</span>
                        <span className="text-[9px] text-muted-foreground flex-shrink-0">
                          {new Date(n.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{n.body}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Test notification */}
          {notifications.length === 0 && (
            <div className="border-t border-border/30 px-4 py-3">
              <button
                onClick={() => sendPushNotification("GizzyFx Test", "Notifications are working!")}
                className="w-full rounded-md bg-secondary/50 px-3 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
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
