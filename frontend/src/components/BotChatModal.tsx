import { useState, useRef, useEffect } from "react";
import { X, Send, Loader2, Bot, Trash2, User } from "lucide-react";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface BotChatModalProps {
  open: boolean;
  onClose: () => void;
  botId: string;
  botName: string;
}

export function BotChatModal({ open, onClose, botId, botName }: BotChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [collectedData, setCollectedData] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMessage: Message = { role: "user", content: text };
    const updatedMessages = [...messages.filter((m) => m.role !== "system"), userMessage];
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);

    try {
      const { data } = await api.post<{ role: string; content: string; extractedData?: Record<string, string> }>(`/bots/${botId}/chat`, {
        messages: updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        collectedData,
      });
      const newMessages: Message[] = [{ role: "assistant", content: data.content }];

      // Show system note if data was extracted
      if (data.extractedData && Object.keys(data.extractedData).length > 0) {
        setCollectedData((prev) => ({ ...prev, ...data.extractedData }));
        const fields = Object.entries(data.extractedData)
          .map(([key, value]) => `${key}: ${value}`)
          .join(", ");
        newMessages.push({ role: "system", content: `📋 Dato recopilado: ${fields}` });
      }

      setMessages((prev) => [...prev, ...newMessages]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Error al obtener respuesta del bot. Verifica la configuración." },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setCollectedData({});
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-150" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 h-[600px] max-h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-brand-50 flex items-center justify-center">
              <Bot className="h-4 w-4 text-brand-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Probar Bot</h3>
              <p className="text-[10px] text-gray-500">{botName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleClear}
              disabled={messages.length === 0 || sending}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Limpiar historial"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <Bot className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 font-medium">Inicia una conversación</p>
              <p className="text-xs text-gray-400 mt-1">Envía un mensaje para probar el bot con su configuración actual</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : msg.role === "system" ? "justify-center" : "justify-start"}`}>
              {msg.role === "system" ? (
                <div className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200">
                  <p className="text-[11px] text-amber-700">{msg.content}</p>
                </div>
              ) : (
                <>
                  {msg.role === "assistant" && (
                    <div className="h-6 w-6 rounded-full bg-brand-50 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="h-3 w-3 text-brand-600" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-brand-600 text-white rounded-br-sm"
                        : "bg-gray-100 text-gray-800 rounded-bl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  {msg.role === "user" && (
                    <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="h-3 w-3 text-gray-600" />
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {sending && (
            <div className="flex gap-2.5 justify-start">
              <div className="h-6 w-6 rounded-full bg-brand-50 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-3 w-3 text-brand-600" />
              </div>
              <div className="bg-gray-100 px-3 py-2 rounded-xl rounded-bl-sm">
                <div className="flex items-center gap-1">
                  <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <div className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-gray-100 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe un mensaje..."
              rows={1}
              disabled={sending}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-none max-h-24 disabled:opacity-50"
              style={{ minHeight: "38px" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "38px";
                target.style.height = Math.min(target.scrollHeight, 96) + "px";
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="h-[38px] w-[38px] flex items-center justify-center rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">
            Enter para enviar · Shift+Enter para nueva línea
          </p>
        </div>
      </div>
    </div>
  );
}
