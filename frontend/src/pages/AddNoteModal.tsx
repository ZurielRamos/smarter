import { useState, useRef } from "react";
import { X, Bold, Italic, List, ListOrdered, Link, StickyNote, Clock, User } from "lucide-react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { createNote } from "@/services/api";
import type { ClientRecord } from "@/services/api";

interface AddNoteModalProps {
  client: ClientRecord;
  onClose: () => void;
  onSaved: () => void;
}

export function AddNoteModal({ client, onClose, onSaved }: AddNoteModalProps) {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const fullName = [client.firstName, client.lastName].filter(Boolean).join(" ") || "Sin nombre";
  const authorName = user?.name || user?.email || "Tú";
  const now = new Date().toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });

  function execCommand(command: string, value?: string) {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  }

  async function handleSave() {
    const content = editorRef.current?.innerHTML || "";
    if (!content.trim() || content === "<br>") return;

    setSaving(true);
    try {
      await createNote({
        tenantId,
        recordId: client.id,
        content,
        authorId: user?.id,
        authorName: user?.name || user?.email,
      });
      onSaved();
    } catch {
      // error toast handled by interceptor
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-lg rounded-2xl shadow-2xl border border-white/30 overflow-hidden"
          style={{ background: "rgba(255, 255, 255, 0.94)", backdropFilter: "blur(24px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 pt-5 pb-4 border-b border-border">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 flex items-center justify-center">
                  <StickyNote className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Nueva nota</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Añade contexto o seguimiento a este contacto</p>
                </div>
              </div>
              <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Contact + Author info */}
            <div className="flex items-center gap-4 mt-4 px-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                  {(client.firstName?.[0] || "?").toUpperCase()}
                </div>
                <span className="font-medium text-foreground">{fullName}</span>
              </div>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                <span>{authorName}</span>
              </div>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{now}</span>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-1 px-6 py-2.5 border-b border-border bg-muted/50">
            <ToolbarButton onClick={() => execCommand("bold")} icon={Bold} tooltip="Negrita" />
            <ToolbarButton onClick={() => execCommand("italic")} icon={Italic} tooltip="Cursiva" />
            <div className="w-px h-4 bg-border mx-1.5" />
            <ToolbarButton onClick={() => execCommand("insertUnorderedList")} icon={List} tooltip="Lista" />
            <ToolbarButton onClick={() => execCommand("insertOrderedList")} icon={ListOrdered} tooltip="Lista numerada" />
            <div className="w-px h-4 bg-border mx-1.5" />
            <ToolbarButton onClick={() => {
              const url = prompt("URL del enlace:");
              if (url) execCommand("createLink", url);
            }} icon={Link} tooltip="Enlace" />
          </div>

          {/* Editor */}
          <div className="relative px-6 py-4">
            <div
              ref={editorRef}
              contentEditable
              className="min-h-[160px] max-h-[300px] overflow-y-auto text-sm text-foreground leading-relaxed focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-emerald-600 dark:[&_a]:text-emerald-400 [&_a]:underline [&_b]:font-semibold empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground empty:before:pointer-events-none"
              data-placeholder="Escribe tu nota aquí... Puedes documentar llamadas, acuerdos, próximos pasos o cualquier información relevante sobre este contacto."
            />
          </div>

          {/* Tips */}
          <div className="px-6 pb-3">
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50/60 dark:bg-amber-500/10 border border-amber-100/60 dark:border-amber-500/20">
              <StickyNote className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                <span className="font-medium">Tip:</span> Usa notas para registrar el contexto de llamadas, reuniones, acuerdos importantes o recordatorios de seguimiento. Solo tu equipo puede verlas.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30">
            <p className="text-[11px] text-muted-foreground">Las notas son privadas y solo visibles para tu equipo</p>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
              >
                {saving ? "Guardando..." : "Guardar nota"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ToolbarButton({ onClick, icon: Icon, tooltip }: { onClick: () => void; icon: React.ElementType; tooltip: string }) {
  return (
    <button
      type="button"
      title={tooltip}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card hover:shadow-sm border border-transparent hover:border-border transition-all"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
