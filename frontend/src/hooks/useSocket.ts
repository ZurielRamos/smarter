import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_WS_URL || window.location.origin + "/ws";

export function useSocket(tenantId: string | undefined) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const joinedRoomsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!tenantId) return;

    const socket = io(SOCKET_URL, {
      query: { tenantId },
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on("connect", () => {
      console.log("[WS] Connected:", socket.id);
      setConnected(true);
      // Re-join all rooms on reconnect
      joinedRoomsRef.current.forEach((room) => {
        socket.emit("join_conversation", room);
      });
    });

    socket.on("disconnect", (reason) => {
      console.log("[WS] Disconnected:", reason);
      setConnected(false);
    });

    socket.on("reconnect", (attemptNumber: number) => {
      console.log("[WS] Reconnected after", attemptNumber, "attempts");
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      joinedRoomsRef.current.clear();
      setConnected(false);
    };
  }, [tenantId]);

  const joinConversation = useCallback((conversationId: string) => {
    joinedRoomsRef.current.add(conversationId);
    socketRef.current?.emit("join_conversation", conversationId);
  }, []);

  const leaveConversation = useCallback((conversationId: string) => {
    joinedRoomsRef.current.delete(conversationId);
    socketRef.current?.emit("leave_conversation", conversationId);
  }, []);

  /**
   * Register an event listener on the socket.
   * The `connected` dependency ensures listeners are re-registered after reconnection.
   */
  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    const socket = socketRef.current;
    if (!socket) return () => {};
    socket.on(event, handler);
    return () => { socket.off(event, handler); };
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  return { socket: socketRef, joinConversation, leaveConversation, on, connected };
}
