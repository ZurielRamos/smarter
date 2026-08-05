import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  MessageSquare,
  UserPlus,
  StickyNote,
  ArrowRightLeft,
  Megaphone,
  AtSign,
  Check,
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import { useParams, useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { timeAgo } from "@/lib/timeAgo";

interface Notification {
  id: string;
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  metadata: Record<string, any> | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

const SOCKET_URL = import.meta.env.VITE_WS_URL
  ? import.meta.env.VITE_WS_URL.replace("/ws", "/ws/notifications")
  : window.location.origin + "/ws/notifications";

const typeConfig: Record<string, { icon: typeof Bell; color: string }> = {
  message_received: { icon: MessageSquare, color: "text-green-500" },
  contact_assigned: { icon: UserPlus, color: "text-indigo-500" },
  note_created: { icon: StickyNote, color: "text-amber-500" },
  status_changed: { icon: ArrowRightLeft, color: "text-blue-500" },
  campaign_completed: { icon: Megaphone, color: "text-emerald-500" },
  mention: { icon: AtSign, color: "text-purple-500" },
};

export function NotificationBell() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentTenant = user?.tenantRoles?.find((tr) => tr.tenant.slug === slug);
  const userId = user?.id;

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);

  // Keep pathname ref up to date
  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await api.get("/notifications", {
        params: { userId, limit: 20, offset: 0 },
      });
      // Deduplicate message_received: keep only the most recent per conversation
      const seen = new Set<string>();
      const deduped: Notification[] = [];
      for (const n of data.data as Notification[]) {
        if (n.type === "message_received" && n.metadata?.conversationId) {
          if (seen.has(n.metadata.conversationId)) continue;
          seen.add(n.metadata.conversationId);
        }
        deduped.push(n);
      }
      setNotifications(deduped);
    } catch {}
  }, [userId]);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await api.get("/notifications/unread-count", {
        params: { userId },
      });
      setUnreadCount(data.count);
    } catch {}
  }, [userId]);

  // Initial fetch + polling fallback
  useEffect(() => {
    fetchUnreadCount();
    fetchNotifications();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount, fetchNotifications]);

  // WebSocket connection for real-time notifications
  useEffect(() => {
    if (!userId) return;

    const socket = io(SOCKET_URL, {
      query: { userId, tenantId: currentTenant?.tenantId || "" },
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    socket.on("notification:new", (notification: Notification) => {
      // If user is currently viewing this conversation, don't show badge
      const convId = notification.metadata?.conversationId;
      const isViewingConversation =
        notification.type === "message_received" &&
        convId &&
        pathnameRef.current.endsWith(`/conversaciones/${convId}`);

      setNotifications((prev) => {
        // For message_received, replace existing notification for the same conversation
        if (notification.type === "message_received" && convId) {
          const filtered = prev.filter(
            (n) => !(n.type === "message_received" && n.metadata?.conversationId === convId)
          );
          return [notification, ...filtered].slice(0, 20);
        }
        return [notification, ...prev].slice(0, 20);
      });

      if (!isViewingConversation) {
        // Only increment if there wasn't already an unread notification for this conversation
        if (notification.type === "message_received" && convId) {
          setNotifications((prev) => {
            const existingUnread = prev.find(
              (n) => n.id !== notification.id && n.type === "message_received" && !n.read && n.metadata?.conversationId === convId
            );
            if (!existingUnread) {
              setUnreadCount((c) => c + 1);
            }
            return prev;
          });
        } else {
          setUnreadCount((prev) => prev + 1);
        }

        // Show toast notification
        toast.custom((id) => (
          <div
            onClick={() => {
              toast.dismiss(id);
              handleMarkAsRead(notification);
            }}
            className="w-[360px] cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-xl flex items-start gap-3"
          >
            <div className={`mt-0.5 shrink-0 h-9 w-9 rounded-full flex items-center justify-center ${
              typeConfig[notification.type]?.color || "text-gray-400"
            } bg-gray-100`}>
              {(() => {
                const Icon = typeConfig[notification.type]?.icon || Bell;
                return <Icon className="h-4 w-4" />;
              })()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{notification.title}</p>
              {notification.body && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.body}</p>
              )}
              <p className="text-[10px] text-gray-400 mt-1">Ahora</p>
            </div>
          </div>
        ), { duration: 5000 });
      } else {
        // Auto-mark as read since user is already viewing the conversation
        api.put(`/notifications/${notification.id}/read`).catch(() => {});
        setNotifications((prev) =>
          prev.map((n) => n.id === notification.id ? { ...n, read: true, readAt: new Date().toISOString() } : n)
        );
      }
    });

    socket.on("notification:unread_count", ({ count }: { count: number }) => {
      setUnreadCount(count);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const handleToggle = () => {
    setOpen((v) => !v);
    if (!open) {
      fetchNotifications();
    }
  };

  const handleMarkAsRead = async (notification: Notification) => {
    if (!notification.read) {
      try {
        await api.put(`/notifications/${notification.id}/read`);
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, read: true, readAt: new Date().toISOString() } : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {}
    }
    // Build navigation link based on notification type
    if (notification.type === "message_received" && notification.metadata?.conversationId) {
      setOpen(false);
      navigate(`/${slug}/comunicaciones/conversaciones/${notification.metadata.conversationId}`);
    } else if (notification.link) {
      // Replace tenantId in link with slug
      const link = notification.link.startsWith("/")
        ? notification.link.replace(/^\/[^/]+/, `/${slug}`)
        : notification.link;
      setOpen(false);
      navigate(link);
    }
  };

  const handleMarkAllRead = async () => {
    if (!userId) return;
    try {
      await api.put("/notifications/read-all", null, { params: { userId } });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() })));
      setUnreadCount(0);
    } catch {}
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={handleToggle}
        className="relative h-8 w-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
      >
        <Bell className="h-4 w-4 text-brand-300" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-brand-900">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -5 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full mt-2 w-[380px] max-h-[480px] rounded-2xl shadow-2xl border border-white/20 overflow-hidden z-50"
            style={{ background: "rgba(255, 255, 255, 0.97)", backdropFilter: "blur(24px)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Notificaciones</h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
                >
                  <Check className="h-3 w-3" />
                  Marcar todas como leídas
                </button>
              )}
            </div>

            {/* List */}
            <div className="overflow-y-auto max-h-[380px]">
              {notifications.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Bell className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Sin notificaciones</p>
                </div>
              ) : (
                <div className="py-1">
                  {notifications.map((notification) => {
                    const config = typeConfig[notification.type] || { icon: Bell, color: "text-gray-400" };
                    const Icon = config.icon;

                    return (
                      <button
                        key={notification.id}
                        onClick={() => handleMarkAsRead(notification)}
                        className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                          !notification.read ? "bg-indigo-50/40" : ""
                        }`}
                      >
                        {/* Icon */}
                        <div className={`mt-0.5 shrink-0 h-7 w-7 rounded-full flex items-center justify-center bg-gray-100 ${config.color}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {notification.title}
                          </p>
                          {notification.body && (
                            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">
                              {notification.body}
                            </p>
                          )}
                          <p className="text-[11px] text-gray-400 mt-1">
                            {timeAgo(notification.createdAt)}
                          </p>
                        </div>

                        {/* Unread indicator */}
                        {!notification.read && (
                          <div className="mt-2 shrink-0 h-2 w-2 rounded-full bg-indigo-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="border-t border-gray-100 px-4 py-2.5">
                <p className="text-[11px] text-center text-gray-400">Ver todas</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
