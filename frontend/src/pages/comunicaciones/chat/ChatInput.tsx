import { memo, useState, useRef, useCallback } from "react";
import { Send, Smile, Paperclip, Mic, StickyNote, Image, FileText, Trash2, X, Reply } from "lucide-react";
import { TemplateSelector } from "@/components/TemplateModal";
import type { Message, Conversation } from "./types";
import { getDisplayName } from "./types";

interface ChatInputProps {
  activeConversation: Conversation;
  isWindowClosed: boolean;
  replyTo: Message | null;
  onClearReply: () => void;
  onSend: (content: string, mode: "reply" | "note", replyToExternalId?: string | null) => void;
  onSendFile: (file: File, caption?: string) => void;
  onSendAudio: (blob: Blob, mimeType: string) => void;
  onSelectTemplate: (t: any) => void;
}

export const ChatInput = memo(function ChatInput({
  activeConversation,
  isWindowClosed,
  replyTo,
  onClearReply,
  onSend,
  onSendFile,
  onSendAudio,
  onSelectTemplate,
}: ChatInputProps) {
  const [inputMode, setInputMode] = useState<"reply" | "note">("reply");
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ file: File; preview: string | null } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const QUICK_EMOJIS = ["😀", "😂", "❤️", "👍", "🙏", "🎉", "🔥", "👋", "✅", "💯", "😊", "🤝", "⭐", "💪", "🙌", "😍", "🤔", "👏", "💚", "🚀"];

  const handleSend = useCallback(async () => {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      await onSend(newMessage.trim(), inputMode, replyTo?.externalId);
      setNewMessage("");
      onClearReply();
    } finally {
      setSending(false);
    }
  }, [newMessage, inputMode, replyTo, onSend, onClearReply]);

  const handleSendWithFile = useCallback(async () => {
    if (pendingFile) {
      setSending(true);
      try {
        await onSendFile(pendingFile.file, newMessage.trim() || undefined);
        if (pendingFile.preview) URL.revokeObjectURL(pendingFile.preview);
        setPendingFile(null);
        setNewMessage("");
      } finally {
        setSending(false);
      }
    } else {
      handleSend();
    }
  }, [pendingFile, newMessage, handleSend, onSendFile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      setPendingFile({ file, preview: URL.createObjectURL(file) });
    } else {
      setPendingFile({ file, preview: null });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (docInputRef.current) docInputRef.current.value = "";
  };

  const cancelPendingFile = () => {
    if (pendingFile?.preview) URL.revokeObjectURL(pendingFile.preview);
    setPendingFile(null);
  };

  const insertEmoji = (emoji: string) => {
    setNewMessage((prev) => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="border-t border-gray-200 bg-white shrink-0">
      {/* Tabs */}
      <div className="flex items-center px-5 pt-2">
        <button
          onClick={() => setInputMode("reply")}
          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${inputMode === "reply" ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
        >
          Responder
        </button>
        <button
          onClick={() => setInputMode("note")}
          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${inputMode === "note" ? "bg-yellow-100 text-yellow-800" : "text-gray-500 hover:text-gray-700"}`}
        >
          <span className="flex items-center gap-1"><StickyNote className="h-3 w-3" /> Nota privada</span>
        </button>
      </div>

      {/* 24h window closed alert */}
      {isWindowClosed && inputMode === "reply" ? (
        <div className="px-5 py-4">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
            <span className="text-amber-500 text-lg">⏱️</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">Ventana de conversación cerrada</p>
              <p className="text-xs text-amber-600 mt-0.5">Han pasado más de 24 horas desde el último mensaje del contacto. {activeConversation.inbox?.channel === "whatsapp" ? "Usa una plantilla para reabrir la conversación." : "Espera a que el contacto responda."}</p>
            </div>
          </div>
          {activeConversation.inbox?.channel === "whatsapp" && (
            <div className="mt-2 flex justify-end">
              <TemplateSelector inboxId={activeConversation.inboxId} onSelect={onSelectTemplate} />
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Reply preview */}
          {replyTo && inputMode === "reply" && (
            <div className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 rounded-lg bg-gray-100 border-l-3 border-brand-500">
              <Reply className="h-4 w-4 text-brand-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium text-brand-600">
                  Respondiendo a {replyTo.direction === "outbound" ? "ti" : getDisplayName(activeConversation)}
                </p>
                <p className="text-xs text-gray-500 truncate">{replyTo.content || (replyTo.mediaUrl ? "📷 Foto" : `[${replyTo.messageType}]`)}</p>
              </div>
              <button onClick={onClearReply} className="p-1 rounded hover:bg-gray-200 text-gray-400 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* File preview */}
          {pendingFile && (
            <div className="px-5 pt-2">
              {pendingFile.preview ? (
                <div className="relative inline-block">
                  {pendingFile.file.type.startsWith("image/") ? (
                    <img src={pendingFile.preview} alt="Preview" className="h-24 rounded-lg object-cover border border-gray-200" />
                  ) : (
                    <video src={pendingFile.preview} className="h-24 rounded-lg border border-gray-200" />
                  )}
                  <button onClick={cancelPendingFile} className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs hover:bg-red-600 transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 border border-gray-200">
                  <FileText className="h-4 w-4 text-yellow-600 shrink-0" />
                  <span className="text-sm text-gray-700 truncate max-w-[180px]">{pendingFile.file.name}</span>
                  <span className="text-[11px] text-gray-400 shrink-0">{(pendingFile.file.size / 1024).toFixed(0)} KB</span>
                  <button onClick={cancelPendingFile} className="p-0.5 rounded hover:bg-gray-200 text-gray-400 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Textarea */}
          <div className="px-5 py-2">
            <textarea
              ref={textareaRef}
              value={newMessage}
              onChange={(e) => { setNewMessage(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); pendingFile ? handleSendWithFile() : handleSend(); } }}
              placeholder={pendingFile ? "Añade un texto (opcional)..." : inputMode === "note" ? "Escribe una nota privada..." : "Shift + enter para nueva línea"}
              rows={1}
              className={`w-full resize-none text-sm outline-none placeholder-gray-400 ${inputMode === "note" ? "text-yellow-800" : "text-gray-800"}`}
              style={{ minHeight: "24px", maxHeight: "120px" }}
            />
          </div>

          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 pb-3">
            <div className="flex items-center gap-1">
              {/* Emoji */}
              <div className="relative">
                <button onClick={() => setShowEmojiPicker((v) => !v)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                  <Smile className="h-4.5 w-4.5" />
                </button>
                {showEmojiPicker && (
                  <div className="absolute bottom-full left-0 mb-2 p-2 bg-white rounded-xl shadow-lg border border-gray-200 grid grid-cols-10 gap-1 w-64 z-50">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button key={emoji} onClick={() => insertEmoji(emoji)} className="h-8 w-8 flex items-center justify-center rounded hover:bg-gray-100 text-lg transition-colors">
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Image/Video */}
              <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Enviar imagen o video">
                <Image className="h-4.5 w-4.5" />
              </button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} accept="image/*,video/*" />
              {/* Document */}
              <button onClick={() => docInputRef.current?.click()} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Enviar documento">
                <FileText className="h-4.5 w-4.5" />
              </button>
              <input ref={docInputRef} type="file" className="hidden" onChange={handleFileSelect} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" />
              {/* Audio — isolated in its own component */}
              <AudioRecorder onSendAudio={onSendAudio} />
            </div>

            {/* Send */}
            <div className="flex items-center gap-2">
              {activeConversation.inbox?.channel === "whatsapp" && inputMode === "reply" && (
                <TemplateSelector inboxId={activeConversation.inboxId} onSelect={onSelectTemplate} iconOnly />
              )}
              <button
                onClick={pendingFile ? handleSendWithFile : handleSend}
                disabled={(!newMessage.trim() && !pendingFile) || sending}
                className={`flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-40 ${inputMode === "note" ? "bg-yellow-500 hover:bg-yellow-600 text-white" : "bg-brand-600 hover:bg-brand-700 text-white"}`}
              >
                <Send className="h-4 w-4" />
                {sending ? "..." : inputMode === "note" ? "Guardar nota" : "Enviar"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

/**
 * AudioRecorder — isolated component so the 1-second timer
 * doesn't re-render the entire ChatInput tree.
 */
function AudioRecorder({ onSendAudio }: { onSendAudio: (blob: Blob, mimeType: string) => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioPreview, setAudioPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus") ? "audio/ogg;codecs=opus" : "audio/webm;codecs=opus";
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {}
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      setAudioPreview({ blob, url });
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
    mediaRecorderRef.current.stop();
    setIsRecording(false);
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    if (audioPreview) {
      URL.revokeObjectURL(audioPreview.url);
      setAudioPreview(null);
    }
  };

  const sendAudio = () => {
    if (!audioPreview) return;
    onSendAudio(audioPreview.blob, audioPreview.blob.type);
    URL.revokeObjectURL(audioPreview.url);
    setAudioPreview(null);
  };

  if (isRecording) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-red-50 border border-red-200">
        <button onClick={cancelRecording} className="p-1 rounded text-red-500 hover:bg-red-100 transition-colors" title="Cancelar">
          <Trash2 className="h-4 w-4" />
        </button>
        <span className="text-xs font-mono text-red-600 w-10">{formatTime(recordingTime)}</span>
        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        <button onClick={stopRecording} className="p-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors" title="Parar grabación">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (audioPreview) {
    return (
      <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-brand-50 border border-brand-200">
        <button onClick={cancelRecording} className="p-1 rounded text-gray-500 hover:bg-gray-200 transition-colors" title="Descartar">
          <Trash2 className="h-4 w-4" />
        </button>
        <audio src={audioPreview.url} controls className="h-8 max-w-[160px]" />
        <button onClick={sendAudio} className="p-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white transition-colors" title="Enviar audio">
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button onClick={startRecording} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Grabar nota de voz">
      <Mic className="h-4.5 w-4.5" />
    </button>
  );
}
