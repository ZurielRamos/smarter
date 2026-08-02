import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_WS_URL || window.location.origin + "/ws";

export function useSocket(tenantId: string | undefined) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    const socket = io(SOCKET_URL, {
      query: { tenantId },
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    socket.on("connect", () => {
      console.log("[WS] Connected:", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("[WS] Disconnected");
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [tenantId]);

  const joinConversation = useCallback((conversationId: string) => {
    socketRef.current?.emit("join_conversation", conversationId);
  }, []);

  const leaveConversation = useCallback((conversationId: string) => {
    socketRef.current?.emit("leave_conversation", conversationId);
  }, []);

  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    socketRef.current?.on(event, handler);
    return () => { socketRef.current?.off(event, handler); };
  }, []);

  return { socket: socketRef, joinConversation, leaveConversation, on };
}
