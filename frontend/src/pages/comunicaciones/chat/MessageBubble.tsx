import { memo, useState } from "react";
import { StickyNote, Image } from "lucide-react";
import { formatWhatsAppText } from "@/utils/whatsapp-format";
import type { Message } from "./types";

interface MessageBubbleProps {
  msg: Message;
  replyMsg: Message | null;
  displayName: string;
  onContextMenu: (e: React.MouseEvent, msg: Message) => void;
  onReplyClick: (msgId: string) => void;
}

export const MessageBubble = memo(function MessageBubble({
  msg,
  replyMsg,
  displayName,
  onContextMenu,
  onReplyClick,
}: MessageBubbleProps) {
  if (msg.messageType === "system") {
    return (
      <div id={`msg-${msg.id}`} className="flex justify-center">
        <span className="relative group/sys px-3 py-1 rounded-full bg-gray-200/70 text-[11px] text-gray-500 font-medium cursor-default">
          {msg.content}
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded-md bg-gray-900 text-white text-[10px] whitespace-nowrap opacity-0 group-hover/sys:opacity-100 pointer-events-none transition-opacity duration-150">
            {new Date(msg.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div
      id={`msg-${msg.id}`}
      className={`flex items-end gap-2 w-full ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
      onContextMenu={(e) => onContextMenu(e, msg)}
    >
      {msg.direction === "outbound" && msg.sender && (
        <div className="relative group h-6 w-6 shrink-0 order-1">
          <div className="h-6 w-6 rounded-full bg-brand-200 flex items-center justify-center text-[10px] font-bold text-brand-700">
            {msg.sender.name.charAt(0).toUpperCase()}
          </div>
          <div className="absolute bottom-full right-0 mb-1.5 px-2 py-1 rounded-md bg-gray-900 text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
            Enviado por: {msg.sender.name}
          </div>
        </div>
      )}
      <div className={`${msg.messageType === "template" ? "max-w-[320px]" : msg.direction === "outbound" ? "max-w-[min(70%,400px)]" : "max-w-[min(40%,300px)]"} px-4 py-2.5 rounded-2xl text-sm break-words ${msg.messageType === "template" ? "bg-green-50/90 border border-green-200 text-gray-800 rounded-br-md backdrop-blur-sm" : msg.messageType === "note" ? "bg-yellow-100/90 border border-yellow-200 text-yellow-900 rounded-br-md backdrop-blur-sm" : msg.direction === "outbound" ? "bg-brand-600/90 text-white rounded-br-md backdrop-blur-sm" : "bg-white/90 border border-gray-200 text-gray-800 rounded-bl-md backdrop-blur-sm"}`}>
        {msg.messageType === "template" && <TemplateBubble msg={msg} />}
        {msg.messageType === "note" && (
          <p className="text-[10px] font-medium text-yellow-600 mb-1 flex items-center gap-1"><StickyNote className="h-3 w-3" /> Nota privada</p>
        )}
        {replyMsg && (
          <div
            onClick={() => onReplyClick(replyMsg.id)}
            className={`mb-2 px-3 py-1.5 rounded-lg border-l-2 cursor-pointer transition-colors ${msg.direction === "outbound" ? "bg-white/10 border-white/40 hover:bg-white/15" : "bg-gray-100 border-gray-400 hover:bg-gray-150"}`}
          >
            <p className={`text-[10px] font-medium ${msg.direction === "outbound" ? "text-white/70" : "text-gray-500"}`}>
              {replyMsg.direction === "outbound" ? "Tú" : displayName}
            </p>
            <div className="flex items-center gap-2">
              <p className={`text-[11px] truncate flex-1 ${msg.direction === "outbound" ? "text-white/60" : "text-gray-500"}`}>
                {replyMsg.content || (replyMsg.mediaUrl ? "" : `[${replyMsg.messageType}]`)}
              </p>
              {replyMsg.mediaUrl && (replyMsg.messageType === "image" || replyMsg.mediaMimeType?.startsWith("image/")) && (
                <img src={replyMsg.mediaUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
              )}
            </div>
          </div>
        )}
        <MediaContent msg={msg} />
        {msg.content && msg.messageType !== "template" && <p className="whitespace-pre-wrap">{formatWhatsAppText(msg.content)}</p>}
        {!msg.content && !msg.mediaUrl && msg.messageType !== "template" && <p className="whitespace-pre-wrap text-gray-400 italic">[{msg.messageType}]</p>}
        <MessageTimestamp msg={msg} />
      </div>
    </div>
  );
});

function MediaContent({ msg }: { msg: Message }) {
  if (!msg.mediaUrl) return null;
  if (msg.messageType === "image" || msg.mediaMimeType?.startsWith("image/")) {
    return <ChatImage src={msg.mediaUrl} alt={msg.content || "Imagen"} />;
  }
  if (msg.messageType === "video" || msg.mediaMimeType?.startsWith("video/")) {
    return <video src={msg.mediaUrl} controls className="rounded-lg max-w-full max-h-60 mb-1" />;
  }
  if (msg.messageType === "audio" || msg.mediaMimeType?.startsWith("audio/")) {
    return <audio src={msg.mediaUrl} controls className="max-w-full mb-1" />;
  }
  if (msg.messageType === "document") {
    return (
      <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-1 ${msg.direction === "outbound" ? "bg-white/10 hover:bg-white/20" : "bg-gray-100 hover:bg-gray-200"} transition-colors`}>
        <span className="text-lg">📄</span>
        <span className={`text-xs underline ${msg.direction === "outbound" ? "text-white/80" : "text-brand-600"}`}>Abrir documento</span>
      </a>
    );
  }
  if (msg.messageType === "sticker") {
    return <img src={msg.mediaUrl} alt="Sticker" className="max-w-[150px] max-h-[150px] mb-1" />;
  }
  return null;
}

function MessageTimestamp({ msg }: { msg: Message }) {
  return (
    <p className={`text-[10px] mt-1 flex items-center gap-1 ${msg.messageType === "template" ? "text-green-500" : msg.messageType === "note" ? "text-yellow-500" : msg.direction === "outbound" ? "text-white/60" : "text-gray-400"}`}>
      {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      {msg.direction === "outbound" && msg.messageType !== "note" && (
        <span className="inline-flex">
          {msg.status === "sending" && <span className="animate-pulse">⏳</span>}
          {msg.status === "sent" && <span>✓</span>}
          {(msg.status === "delivered" || msg.status === "read") && (
            <svg className={`h-3.5 w-3.5 ${msg.status === "read" ? "text-blue-300" : "currentColor"}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1.5 8.5l3 3 7-7" />
              <path d="M5.5 8.5l3 3 7-7" />
            </svg>
          )}
          {msg.status === "failed" && <span className="text-red-300">⚠</span>}
        </span>
      )}
    </p>
  );
}

function ChatImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative rounded-lg overflow-hidden mb-1 cursor-pointer max-w-full" onClick={() => window.open(src, "_blank")}>
      {!loaded && (
        <div className="w-48 h-36 bg-gray-200/50 backdrop-blur-sm flex items-center justify-center animate-pulse rounded-lg">
          <Image className="h-6 w-6 text-gray-300" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`rounded-lg max-w-full max-h-60 object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0 absolute inset-0"}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

function TemplateBubble({ msg }: { msg: Message }) {
  let templateData: { name?: string; components?: any[] } | null = null;
  try {
    if (msg.mediaUrl && msg.mediaUrl.startsWith("{")) {
      templateData = JSON.parse(msg.mediaUrl);
    }
  } catch {}

  if (!templateData?.components) {
    return (
      <>
        <p className="text-[10px] font-medium text-green-600 mb-1 flex items-center gap-1">📋 Plantilla</p>
        <p className="whitespace-pre-wrap">{formatWhatsAppText(msg.content || "")}</p>
      </>
    );
  }

  const footer = templateData.components.find((c: any) => c.type === "FOOTER");
  const buttons = templateData.components.find((c: any) => c.type === "BUTTONS");
  const header = templateData.components.find((c: any) => c.type === "HEADER");

  const contentLines = (msg.content || "").split("\n");
  const hasHeader = header?.text;
  const renderedHeader = hasHeader ? contentLines[0] : "";
  const renderedBody = hasHeader ? contentLines.slice(1).join("\n") : msg.content || "";

  return (
    <>
      {renderedHeader && <p className="font-bold text-gray-900 text-[13px] mb-1">{renderedHeader}</p>}
      <p className="whitespace-pre-wrap text-[13px] text-gray-700 leading-relaxed">{formatWhatsAppText(renderedBody)}</p>
      {footer?.text && <p className="text-[11px] text-gray-400 mt-2">{formatWhatsAppText(footer.text)}</p>}
      {buttons?.buttons && buttons.buttons.length > 0 && (
        <div className="mt-2 pt-2 border-t border-green-200 space-y-1">
          {buttons.buttons.map((btn: any, i: number) => (
            <div key={i} className="text-center text-xs text-blue-500 font-medium py-0.5">{btn.text}</div>
          ))}
        </div>
      )}
    </>
  );
}
