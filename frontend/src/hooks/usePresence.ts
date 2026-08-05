import { useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/context/AuthContext";
import { useParams } from "react-router-dom";
import { api } from "@/services/api";

export type PresenceStatus = "online" | "offline" | "away";

export interface UserPresence {
  userId: string;
  status: PresenceStatus;
  lastSeen: string;
}

const SOCKET_URL = import.meta.env.VITE_WS_URL
  ? import.meta.env.VITE_WS_URL.replace("/ws", "/ws/notifications")
  : window.location.origin + "/ws/notifications";

export function usePresence() {
  const { user } = useAuth();
  const { slug } = useParams();
  const currentTenant = user?.tenantRoles?.find((tr) => tr.tenant.slug === slug);
  const tenantId = currentTenant?.tenantId;
  const userId = user?.id;

  const [presenceMap, setPresenceMap] = useState<Map<string, UserPresence>>(new Map());
  const socketRef = useRef<Socket | null>(null);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout>>();

  // Connect to WebSocket and listen for presence updates
  useEffect(() => {
    if (!userId || !tenantId) return;

    const socket = io(SOCKET_URL, {
      query: { userId, tenantId },
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    socket.on("presence:update", (presence: UserPresence) => {
      setPresenceMap((prev) => {
        const next = new Map(prev);
        next.set(presence.userId, presence);
        return next;
      });
    });

    socket.on("presence:list", (presences: UserPresence[]) => {
      setPresenceMap((prev) => {
        const next = new Map(prev);
        for (const p of presences) {
          next.set(p.userId, p);
        }
        return next;
      });
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId, tenantId]);

  // Auto-away after 5 minutes of inactivity
  useEffect(() => {
    if (!userId) return;

    const resetInactivity = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);

      // If was away, set back to online
      const current = presenceMap.get(userId);
      if (current?.status === "away") {
        socketRef.current?.emit("presence:set", "online");
      }

      inactivityTimer.current = setTimeout(() => {
        socketRef.current?.emit("presence:set", "away");
      }, 5 * 60 * 1000); // 5 minutes
    };

    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetInactivity));
    resetInactivity();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetInactivity));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [userId, presenceMap]);

  // Request presence for a list of user IDs
  const requestPresence = useCallback((userIds: string[]) => {
    socketRef.current?.emit("presence:get", userIds);
  }, []);

  // Fetch presence via REST (for initial load)
  const fetchPresence = useCallback(async (userIds: string[]) => {
    if (!userIds.length) return;
    try {
      const { data } = await api.get<UserPresence[]>("/notifications/presence", {
        params: { userIds: userIds.join(",") },
      });
      setPresenceMap((prev) => {
        const next = new Map(prev);
        for (const p of data) {
          next.set(p.userId, p);
        }
        return next;
      });
    } catch {}
  }, []);

  // Set own status manually
  const setMyStatus = useCallback((status: PresenceStatus) => {
    socketRef.current?.emit("presence:set", status);
  }, []);

  const getStatus = useCallback((uid: string): PresenceStatus => {
    return presenceMap.get(uid)?.status || "offline";
  }, [presenceMap]);

  return { presenceMap, getStatus, requestPresence, fetchPresence, setMyStatus };
}
