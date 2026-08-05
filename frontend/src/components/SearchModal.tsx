import { useState, useEffect, useRef } from "react";
import { Search, MessageSquare, ArrowRight, Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { globalSearch } from "@/services/api";
import type { GlobalSearchResult } from "@/services/api";
import { useAuth } from "@/context/AuthContext";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export function SearchModal({ open, onClose }: SearchModalProps) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults(null);
      return;
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await globalSearch(tenantId, query.trim());
        setResults(res);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [query, tenantId]);

  // Close on escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  function navigateTo(path: string) {
    onClose();
    navigate(path);
  }

  const hasResults = results && (results.contacts.length > 0 || results.messages.length > 0);
  const noResults = results && results.contacts.length === 0 && results.messages.length === 0;

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-xl rounded-2xl shadow-2xl border border-white/30 overflow-hidden"
          style={{ background: "rgba(255, 255, 255, 0.96)", backdropFilter: "blur(24px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
            <Search className="h-5 w-5 text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar contactos o mensajes..."
              className="flex-1 text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400 shrink-0" />}
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-[10px] text-gray-500 font-mono">ESC</kbd>
          </div>

          {/* Results */}
          <div className="max-h-[50vh] overflow-y-auto">
            {!query.trim() && (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-gray-400">Escribe para buscar contactos o mensajes</p>
                <p className="text-xs text-gray-300 mt-1">Mínimo 2 caracteres</p>
              </div>
            )}

            {noResults && (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-gray-500">Sin resultados para "{query}"</p>
              </div>
            )}

            {hasResults && (
              <div className="py-2">
                {/* Contacts */}
                {results.contacts.length > 0 && (
                  <div>
                    <p className="px-5 py-1.5 text-[10px] font-semibold text-gray-400 uppercase">Contactos</p>
                    {results.contacts.map((contact) => {
                      const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Sin nombre";
                      return (
                        <button
                          key={contact.id}
                          onClick={() => navigateTo(`/${slug}/clients/${contact.id}`)}
                          className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0 overflow-hidden">
                            {contact.avatarUrl ? (
                              <img src={contact.avatarUrl} className="h-full w-full object-cover" />
                            ) : (
                              (contact.firstName?.[0] || "?").toUpperCase()
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                            <p className="text-xs text-gray-500 truncate">{contact.email || contact.phone || ""}</p>
                          </div>
                          {contact.status && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">{contact.status}</span>
                          )}
                          <ArrowRight className="h-3.5 w-3.5 text-gray-300" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Messages */}
                {results.messages.length > 0 && (
                  <div>
                    <p className="px-5 py-1.5 text-[10px] font-semibold text-gray-400 uppercase mt-1">Mensajes</p>
                    {results.messages.map((msg) => (
                      <button
                        key={msg.id}
                        onClick={() => navigateTo(`/${slug}/comunicaciones/conversaciones/${msg.conversationId}`)}
                        className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                          <MessageSquare className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">{highlightMatch(msg.content, query)}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {msg.contactName || "Conversación"} · {msg.inboxName || ""} · {new Date(msg.createdAt).toLocaleDateString("es-CO")}
                          </p>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-gray-300" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-2.5 border-t border-gray-100 flex items-center justify-between">
            <p className="text-[11px] text-gray-400">
              <kbd className="px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-mono mr-1">↑↓</kbd> Navegar
              <kbd className="px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-mono mx-1">↵</kbd> Abrir
            </p>
            <p className="text-[11px] text-gray-400">
              <kbd className="px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-mono">⌘K</kbd> para buscar
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const truncated = text.length > 100 ? text.slice(0, 100) + "..." : text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = truncated.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} className="bg-amber-100 text-amber-900 rounded px-0.5">{part}</mark> : part
  );
}
