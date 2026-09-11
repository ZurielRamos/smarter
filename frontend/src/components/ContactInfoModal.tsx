import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Phone,
  Mail,
  IdCard,
  MapPin,
  Building2,
  Tag,
  ExternalLink,
  FileText,
  ImageIcon,
  Video,
  Music,
  Loader2,
  BadgeCheck,
  BellOff,
  Info as InfoIcon,
  Images,
  Tags as TagsIcon,
} from "lucide-react";
import { getClient } from "@/services/api";
import type { ClientRecord } from "@/services/api";
import { chatApi } from "@/pages/comunicaciones/chat/api";
import type { Message } from "@/pages/comunicaciones/chat/types";

export interface ContactInfoModalProps {
  open: boolean;
  onClose: () => void;
  /** ID del ClientRecord vinculado a la conversación (si existe). */
  recordId?: string | null;
  /** ID de la conversación para cargar los archivos compartidos. */
  conversationId: string;
  /** Slug del tenant, para navegar a la ficha completa. */
  slug?: string;
  /** Nombre a mostrar mientras carga o si no hay record. */
  fallbackName: string;
  /** Identificador de contacto (teléfono/BSUID) como respaldo. */
  contactId: string;
}

type SectionKey = "info" | "files" | "tags";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  CC: "Cédula de ciudadanía",
  CE: "Cédula de extranjería",
  NIT: "NIT",
  TI: "Tarjeta de identidad",
  pasaporte: "Pasaporte",
  RUT: "RUT",
};

function mediaIcon(type: string) {
  switch (type) {
    case "image":
    case "sticker":
      return ImageIcon;
    case "video":
      return Video;
    case "audio":
      return Music;
    default:
      return FileText;
  }
}

function fileNameFromUrl(url: string): string {
  try {
    const clean = url.split("?")[0];
    const parts = clean.split("/");
    return decodeURIComponent(parts[parts.length - 1] || "archivo");
  } catch {
    return "archivo";
  }
}

export function ContactInfoModal({
  open,
  onClose,
  recordId,
  conversationId,
  slug,
  fallbackName,
  contactId,
}: ContactInfoModalProps) {
  const navigate = useNavigate();
  const [record, setRecord] = useState<ClientRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [media, setMedia] = useState<Message[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [section, setSection] = useState<SectionKey>("info");

  useEffect(() => {
    if (!open) return;
    setSection("info");
    let cancelled = false;

    if (recordId) {
      setLoading(true);
      getClient(recordId)
        .then((data) => {
          if (!cancelled) setRecord(data);
        })
        .catch(() => {
          if (!cancelled) setRecord(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      setRecord(null);
    }

    setLoadingMedia(true);
    chatApi
      .get<Message[]>(`/chats/conversations/${conversationId}/media`, { params: { limit: 60 } })
      .then(({ data }) => {
        if (!cancelled) setMedia(data);
      })
      .catch(() => {
        if (!cancelled) setMedia([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMedia(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, recordId, conversationId]);

  const displayName = useMemo(() => {
    if (record) {
      if (record.fullName) return record.fullName;
      const parts = [record.firstName, record.lastName].filter(Boolean);
      if (parts.length > 0) return parts.join(" ");
    }
    return fallbackName;
  }, [record, fallbackName]);

  const location = useMemo(() => {
    if (!record) return null;
    return [record.city, record.region].filter(Boolean).join(", ") || null;
  }, [record]);

  if (!open) return null;

  const phone = record?.phone || (contactId && !contactId.includes(".") ? contactId : null);
  const documentLabel = record?.documentType
    ? DOCUMENT_TYPE_LABELS[record.documentType] || record.documentType
    : null;
  const tagCount = record?.tags?.length ?? 0;

  const navItems: { key: SectionKey; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { key: "info", label: "Info.", icon: InfoIcon },
    { key: "files", label: "Archivos, enlaces y docs", icon: Images, count: media.length },
    { key: "tags", label: "Etiquetas", icon: TagsIcon, count: tagCount },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-150" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-3xl mx-4 h-[85vh] max-h-[640px] flex overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-border bg-muted/30 flex flex-col">
          <div className="px-4 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Contacto</h2>
          </div>
          <nav className="flex-1 py-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setSection(item.key)}
                  className={`flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left transition-colors ${
                    active
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-700 dark:text-brand-100 font-medium"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 min-w-0 leading-tight">{item.label}</span>
                  {typeof item.count === "number" && item.count > 0 && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">{item.count}</span>
                  )}
                </button>
              );
            })}
          </nav>
          {recordId && (
            <div className="p-3 border-t border-border">
              <button
                onClick={() => {
                  onClose();
                  if (slug) navigate(`/${slug}/clients/${recordId}`);
                }}
                className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Ver ficha completa
              </button>
            </div>
          )}
        </aside>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header de la sección */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <h3 className="text-sm font-semibold text-foreground">
              {navItems.find((i) => i.key === section)?.label}
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {loading && section === "info" ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : section === "info" ? (
              <div className="space-y-6">
                {/* Avatar + nombre centrado (estilo WhatsApp) */}
                <div className="flex flex-col items-center gap-2">
                  {record?.avatarUrl ? (
                    <img
                      src={record.avatarUrl}
                      alt={displayName}
                      className="h-24 w-24 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-24 w-24 rounded-full bg-brand-50 dark:bg-brand-700 flex items-center justify-center text-3xl font-bold text-brand-600 dark:text-brand-100">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <h2 className="text-lg font-semibold text-foreground text-center mt-1">{displayName}</h2>
                  {phone && <p className="text-sm text-muted-foreground">+{phone}</p>}
                  {record?.status && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-[11px] font-medium text-muted-foreground capitalize">
                      {record.status}
                    </span>
                  )}
                </div>

                {/* Información básica */}
                <section className="space-y-3">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Información
                  </h4>
                  {phone && <InfoRow icon={Phone} label="Teléfono" value={`+${phone}`} />}
                  {record?.email && <InfoRow icon={Mail} label="Correo" value={record.email} />}
                  {record?.documentNumber && (
                    <InfoRow icon={IdCard} label={documentLabel || "Documento"} value={record.documentNumber} />
                  )}
                  {record?.company && <InfoRow icon={Building2} label="Empresa" value={record.company} />}
                  {location && <InfoRow icon={MapPin} label="Ubicación" value={location} />}
                  {!phone && !record?.email && !record?.documentNumber && !record?.company && !location && (
                    <p className="text-sm text-muted-foreground">Sin información adicional.</p>
                  )}
                </section>

                {/* Consentimiento */}
                {record && (
                  <section className="space-y-2">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Consentimiento
                    </h4>
                    <div className="flex items-center gap-2 text-sm">
                      {record.optInWhatsapp ? (
                        <BadgeCheck className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : (
                        <BellOff className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-foreground">
                        WhatsApp: {record.optInWhatsapp ? "Suscrito" : "No suscrito"}
                      </span>
                    </div>
                  </section>
                )}
              </div>
            ) : section === "files" ? (
              <div>
                {loadingMedia ? (
                  <div className="flex items-center justify-center py-10 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : media.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                    <Images className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">No hay archivos compartidos.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {media.map((m) => {
                      const isImage = m.messageType === "image" || m.messageType === "sticker";
                      const Icon = mediaIcon(m.messageType);
                      return (
                        <a
                          key={m.id}
                          href={m.mediaUrl || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group relative aspect-square rounded-lg border border-border overflow-hidden bg-muted flex items-center justify-center hover:border-brand-300 transition-colors"
                          title={m.content || fileNameFromUrl(m.mediaUrl || "")}
                        >
                          {isImage && m.mediaUrl ? (
                            <img src={m.mediaUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <Icon className="h-6 w-6 text-muted-foreground" />
                          )}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              // section === "tags"
              <div>
                {tagCount === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                    <TagsIcon className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">Sin etiquetas.</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {record!.tags!.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-sm text-foreground"
                      >
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground break-words">{value}</p>
      </div>
    </div>
  );
}
