import { memo, useMemo, useCallback, useRef, useEffect } from "react";
import { Virtuoso } from "react-virtuoso";
import type { VirtuosoHandle } from "react-virtuoso";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "./types";
import bgChat from "@/assets/bg-chat.webp";

interface MessageListProps {
  messages: Message[];
  loadingMessages: boolean;
  loadingMore: boolean;
  hasMoreMessages: boolean;
  displayName: string;
  onLoadOlder: () => void;
  onMsgContextMenu: (e: React.MouseEvent, msg: Message) => void;
}

export const MessageList = memo(function MessageList({
  messages,
  loadingMessages,
  loadingMore,
  hasMoreMessages,
  displayName,
  onLoadOlder,
  onMsgContextMenu,
}: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const isFollowingRef = useRef(true);

  // Build a lookup map for reply messages — O(n) once, not O(n²) per render
  const replyMap = useMemo(() => {
    const map = new Map<string, Message>();
    for (const msg of messages) {
      if (msg.externalId) {
        map.set(msg.externalId, msg);
      }
    }
    return map;
  }, [messages]);

  const handleReplyClick = useCallback((msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-brand-300");
      setTimeout(() => el.classList.remove("ring-2", "ring-brand-300"), 2000);
    }
  }, []);

  // Scroll to bottom on new messages when following
  useEffect(() => {
    if (isFollowingRef.current && messages.length > 0) {
      // Small delay to let Virtuoso render
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, behavior: "smooth" });
      });
    }
  }, [messages.length]);

  const handleStartReached = useCallback(() => {
    if (hasMoreMessages && !loadingMore) {
      onLoadOlder();
    }
  }, [hasMoreMessages, loadingMore, onLoadOlder]);

  // itemContent estable: depende de replyMap (memoizado), displayName y de los
  // handlers (estables). Evita recrear el closure por render y ayuda a que el
  // memo de MessageBubble sea efectivo.
  const renderItem = useCallback(
    (_index: number, msg: Message) => {
      const replyMsg = msg.replyToExternalId ? replyMap.get(msg.replyToExternalId) || null : null;
      return (
        <div className="py-1 px-6 w-full box-border">
          <MessageBubble
            msg={msg}
            replyMsg={replyMsg}
            displayName={displayName}
            onContextMenu={onMsgContextMenu}
            onReplyClick={handleReplyClick}
          />
        </div>
      );
    },
    [replyMap, displayName, onMsgContextMenu, handleReplyClick]
  );

  // Fondo compartido por ambos estados (cargando y lista) para que la imagen
  // persista siempre y no desaparezca al terminar el loading.
  const bgStyle: React.CSSProperties = {
    backgroundImage: `url(${bgChat})`,
    backgroundRepeat: "repeat",
    backgroundSize: "400px",
    backgroundColor: "rgba(249,250,251,0.92)",
    backgroundBlendMode: "lighten",
  };

  if (loadingMessages) {
    return (
      <div className="flex-1 overflow-hidden px-6 py-4" style={bgStyle}>
        <div className="flex-1 flex flex-col justify-end gap-3 py-4 h-full">
          <div className="flex justify-start"><div className="h-12 w-48 bg-gray-200/60 rounded-xl animate-pulse" /></div>
          <div className="flex justify-end"><div className="h-16 w-56 bg-brand-100/60 rounded-xl animate-pulse" /></div>
          <div className="flex justify-start"><div className="h-10 w-36 bg-gray-200/60 rounded-xl animate-pulse" /></div>
          <div className="flex justify-end"><div className="h-20 w-64 bg-brand-100/60 rounded-xl animate-pulse" /></div>
          <div className="flex justify-start"><div className="h-12 w-52 bg-gray-200/60 rounded-xl animate-pulse" /></div>
          <div className="flex justify-end"><div className="h-14 w-44 bg-brand-100/60 rounded-xl animate-pulse" /></div>
          <div className="flex justify-start"><div className="h-10 w-40 bg-gray-200/60 rounded-xl animate-pulse" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0 message-list-container" style={bgStyle}>
      {/* Fuerza que la lista interna de Virtuoso no exceda el ancho del panel.
          Sin esto, un item con contenido ancho hace crecer la lista y las
          burbujas alineadas a la derecha se salen del área visible. */}
      <style>{`
        .message-list-container [data-testid="virtuoso-item-list"] {
          width: 100%;
          box-sizing: border-box;
        }
        .message-list-container [data-testid="virtuoso-item-list"] > * {
          max-width: 100%;
          box-sizing: border-box;
        }
      `}</style>
      <Virtuoso
        ref={virtuosoRef}
        style={{ flex: 1, background: "transparent" }}
        className="py-4"
        data={messages}
        initialTopMostItemIndex={messages.length - 1}
        followOutput="smooth"
        startReached={handleStartReached}
        atBottomStateChange={(atBottom) => {
          isFollowingRef.current = atBottom;
        }}
        overscan={300}
        itemContent={renderItem}
        components={{
          Header: () => loadingMore ? (
            <div className="flex justify-center py-2">
              <div className="h-4 w-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
            </div>
          ) : null,
        }}
      />
    </div>
  );
});
