import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileSearch, FileSignature, FileText, Loader2, Trash2, Upload, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { OtpInput } from "@/pages/cursos/OtpInput";
import {
  isUnauthorized,
  portalError,
  recruitPortalApi,
  type PortalContractItem,
  type PortalDocumentItem,
  type PortalField,
  type PortalMe,
} from "@/services/recruitPortal";
import type { ContractDocument } from "@/services/reclutamiento";
import { Field, ModalShell, inputClass, primaryButton, secondaryButton } from "../shared";
import { formatDate, formatMoney } from "../format";
import { ContractText } from "../TemplatePreview";

interface SectionProps {
  slug: string;
  token: string;
  me: PortalMe;
  onSessionLost: () => void;
}

function Card({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="text-muted-foreground">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// ───────────────────────────── Datos ─────────────────────────────

function FieldInput({ f, value, onChange }: { f: PortalField; value: string; onChange: (v: string) => void }) {
  const listId = `sug-${f.key}`;
  const common = { disabled: f.locked, "aria-required": f.required, className: inputClass };
  switch (f.type) {
    case "longtext":
      return <textarea {...common} rows={3} maxLength={f.maxLength} value={value} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <input {...common} type="date" max={new Date().toISOString().slice(0, 10)} value={value} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return <input {...common} type="number" value={value} onChange={(e) => onChange(e.target.value)} />;
    case "boolean":
      return (
        <select {...common} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      );
    case "select":
      return (
        <select {...common} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    default:
      return (
        <>
          <input {...common} type="text" maxLength={f.maxLength} value={value} list={f.suggestions ? listId : undefined} onChange={(e) => onChange(e.target.value)} />
          {f.suggestions && <datalist id={listId}>{f.suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
        </>
      );
  }
}

export function DataSection({ slug, token, me, onChanged, onSessionLost }: SectionProps & { onChanged: (me: PortalMe) => void }) {
  const initial = () => Object.fromEntries(me.fields.map((f) => [f.key, f.value]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Si los datos del servidor cambian (p. ej. tras guardar), se alinea el formulario.
  const serverSignature = JSON.stringify(me.fields.map((f) => [f.key, f.value]));
  useEffect(() => {
    setValues(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSignature]);

  const changed = me.fields.filter((f) => !f.locked && (values[f.key] ?? "") !== f.value);

  const save = async () => {
    setError("");
    const missing = me.fields.find((f) => f.required && !f.locked && !(values[f.key] ?? "").trim());
    if (missing) return setError(`Completa «${missing.label}»`);
    setSaving(true);
    try {
      const next = await recruitPortalApi.saveData(slug, token, Object.fromEntries(changed.map((f) => [f.key, values[f.key] ?? ""])));
      onChanged(next);
      toast.success("Datos guardados");
    } catch (err) {
      if (isUnauthorized(err)) return onSessionLost();
      setError(portalError(err, "No se pudieron guardar tus datos"));
    } finally {
      setSaving(false);
    }
  };

  const complete = me.progress.missingFields === 0;
  return (
    <Card icon={<UserRound className="h-4 w-4" />} title="Mis datos" hint={complete ? "Revisa que estén correctos." : "Completa los datos que faltan."}>
      <div className="grid gap-3 sm:grid-cols-2">
        {me.fields.map((f) => (
          <div key={f.key} className={f.type === "longtext" ? "sm:col-span-2" : ""}>
            <Field label={f.required ? `${f.label} *` : f.label} hint={f.locked ? "Ya no se puede cambiar porque tienes un contrato firmado." : undefined}>
              <FieldInput f={f} value={values[f.key] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
            </Field>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={save} disabled={saving || changed.length === 0} className={primaryButton}>
          {saving && <Loader2 className="h-3 w-3 animate-spin" />} Guardar datos
        </button>
      </div>
    </Card>
  );
}

// ───────────────────────────── Documentos ─────────────────────────────

const DOC_STATUS = {
  pending: { text: "En revisión", className: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" },
  approved: { text: "Aprobado", className: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200" },
  rejected: { text: "Rechazado", className: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200" },
} as const;

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 8 * 1024 * 1024;

function DocumentViewer({ slug, token, doc, onClose }: { slug: string; token: string; doc: NonNullable<PortalDocumentItem["current"]>; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    recruitPortalApi
      .documentBlob(slug, token, doc.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [slug, token, doc.id]);
  return (
    <ModalShell title={doc.fileName} onClose={onClose} wide>
      <div className="px-5 py-4">
        {failed ? (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">No se pudo abrir el documento.</p>
        ) : !url ? (
          <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" /></div>
        ) : doc.mimeType === "application/pdf" ? (
          <iframe title={doc.fileName} src={url} sandbox="" className="h-[70vh] w-full rounded-lg border border-border" />
        ) : (
          <img src={url} alt={doc.fileName} className="mx-auto max-h-[70vh] rounded-lg border border-border object-contain" />
        )}
      </div>
    </ModalShell>
  );
}

export function DocumentsSection({ slug, token, me, onChanged, onSessionLost }: SectionProps & { onChanged: () => Promise<void> }) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [viewing, setViewing] = useState<NonNullable<PortalDocumentItem["current"]> | null>(null);
  const [toDelete, setToDelete] = useState<NonNullable<PortalDocumentItem["current"]> | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const upload = async (item: PortalDocumentItem, file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) return void toast.error("Sube un PDF o una imagen (JPG, PNG o WebP)");
    if (file.size > MAX_BYTES) return void toast.error("El archivo no puede superar 8 MB");
    setBusyKey(item.key);
    try {
      await recruitPortalApi.uploadDocument(slug, token, item.key, file);
      toast.success("Documento enviado");
      await onChanged();
    } catch (err) {
      if (isUnauthorized(err)) return onSessionLost();
      toast.error(portalError(err, "No se pudo subir el documento"));
    } finally {
      setBusyKey(null);
      const el = inputs.current[item.key];
      if (el) el.value = "";
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await recruitPortalApi.deleteDocument(slug, token, toDelete.id);
      toast.success("Documento eliminado");
      await onChanged();
    } catch (err) {
      if (isUnauthorized(err)) return onSessionLost();
      toast.error(portalError(err, "No se pudo eliminar el documento"));
    } finally {
      setToDelete(null);
    }
  };

  return (
    <Card icon={<FileText className="h-4 w-4" />} title="Mis documentos" hint="PDF o imagen, hasta 8 MB. Solo los ve el equipo de la empresa.">
      <ul className="divide-y divide-border">
        {me.documents.map((d) => (
          <li key={d.key} className="flex flex-wrap items-center gap-2 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">
                {d.label} {d.required && <span className="text-xs font-normal text-muted-foreground">(obligatorio)</span>}
              </p>
              {d.help && !d.current && <p className="text-xs text-muted-foreground">{d.help}</p>}
              {d.current && <p className="truncate text-xs text-muted-foreground">{d.current.fileName} · {formatSize(d.current.sizeBytes)}</p>}
              {d.current?.status === "rejected" && d.current.rejectReason && (
                <p role="alert" className="mt-1 rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">
                  Hay que corregirlo: {d.current.rejectReason}
                </p>
              )}
            </div>
            {d.current && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${DOC_STATUS[d.current.status].className}`}>{DOC_STATUS[d.current.status].text}</span>}
            {d.current && (
              <button type="button" className={secondaryButton} onClick={() => setViewing(d.current)}>
                <FileSearch className="h-3.5 w-3.5" /> Ver
              </button>
            )}
            {d.current?.status !== "approved" && (
              <>
                <input
                  ref={(el) => { inputs.current[d.key] = el; }}
                  type="file"
                  accept={ACCEPTED.join(",")}
                  className="sr-only"
                  aria-label={`Elegir archivo para ${d.label}`}
                  onChange={(e) => upload(d, e.target.files?.[0])}
                />
                <button type="button" disabled={busyKey === d.key} className={primaryButton} onClick={() => inputs.current[d.key]?.click()}>
                  {busyKey === d.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {d.current ? "Reemplazar" : "Subir"}
                </button>
                {d.current && (
                  <button type="button" aria-label={`Eliminar ${d.label}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-500" onClick={() => setToDelete(d.current)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {viewing && <DocumentViewer slug={slug} token={token} doc={viewing} onClose={() => setViewing(null)} />}
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Eliminar documento"
        description="Se eliminará el archivo que subiste. Podrás subir otro."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </Card>
  );
}

// ───────────────────────────── Contratos ─────────────────────────────

function ContractModal({
  slug,
  token,
  me,
  item,
  onClose,
  onSigned,
  onSessionLost,
}: SectionProps & { item: PortalContractItem; onClose: () => void; onSigned: () => Promise<void> }) {
  const [doc, setDoc] = useState<ContractDocument | null>(null);
  const [failed, setFailed] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const channels = me.verificationChannel === "both" ? (["email", "phone"] as const) : ([me.verificationChannel] as const);
  const [channel, setChannel] = useState<"email" | "phone">(channels[0]);
  const [otp, setOtp] = useState<{ otpId: string; masked: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    recruitPortalApi.contract(slug, token, item.id).then(setDoc).catch((err) => (isUnauthorized(err) ? onSessionLost() : setFailed(true)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token, item.id]);

  const requestCode = async () => {
    setError("");
    setBusy(true);
    try {
      const r = await recruitPortalApi.requestSignCode(slug, token, item.id, channel);
      setOtp({ otpId: r.otpId, masked: r.maskedDestination });
      setCode("");
    } catch (err) {
      if (isUnauthorized(err)) return onSessionLost();
      setError(portalError(err, "No se pudo enviar el código"));
    } finally {
      setBusy(false);
    }
  };

  const sign = async (value: string) => {
    if (!otp || busy || value.length < 6) return;
    setError("");
    setBusy(true);
    try {
      await recruitPortalApi.sign(slug, token, item.id, otp.otpId, value);
      toast.success("Contrato firmado");
      await onSigned();
      onClose();
    } catch (err) {
      if (isUnauthorized(err)) return onSessionLost();
      setError(portalError(err, "No se pudo firmar el contrato"));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title={`Contrato ${item.number ?? ""}`} onClose={onClose} busy={busy} wide>
      <div className="space-y-4 px-5 py-4">
        {failed ? (
          <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">No se pudo abrir el contrato.</p>
        ) : !doc ? (
          <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" /></div>
        ) : (
          <>
            <div className="max-h-[50vh] overflow-y-auto">
              <ContractText clauses={doc.clauses} language={doc.languageCode ?? "es"} />
            </div>
            {item.signatureStatus === "signed" ? (
              <p className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-300">
                <CheckCircle2 className="h-4 w-4" /> Firmado el {formatDate(item.signedAt ?? "")}.
              </p>
            ) : item.canSign ? (
              <div className="space-y-3 rounded-xl bg-muted/60 p-4">
                {!otp ? (
                  <>
                    <label className="flex items-start gap-2 text-sm text-foreground">
                      <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1" />
                      He leído el contrato completo y lo acepto.
                    </label>
                    {channels.length > 1 && (
                      <Field label="Enviarme el código de confirmación por">
                        <select value={channel} onChange={(e) => setChannel(e.target.value as "email" | "phone")} className={inputClass}>
                          <option value="email">Correo</option>
                          <option value="phone">WhatsApp</option>
                        </select>
                      </Field>
                    )}
                    <p className="text-xs text-muted-foreground">Para firmar te enviaremos un código de confirmación. Quedará registrado con la fecha, tu dirección IP y la huella del texto firmado.</p>
                    {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
                    <button type="button" onClick={requestCode} disabled={!accepted || busy} className={primaryButton}>
                      {busy && <Loader2 className="h-3 w-3 animate-spin" />} <FileSignature className="h-3.5 w-3.5" /> Continuar para firmar
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-foreground">Escribe el código que enviamos a <strong>{otp.masked}</strong>.</p>
                    <OtpInput value={code} onChange={setCode} onComplete={sign} />
                    {error && <p role="alert" className="text-center text-xs text-rose-600 dark:text-rose-400">{error}</p>}
                    <div className="flex items-center justify-between">
                      <button type="button" onClick={requestCode} disabled={busy} className="text-xs text-muted-foreground hover:text-foreground">Reenviar código</button>
                      <button type="button" onClick={() => sign(code)} disabled={busy || code.length < 6} className={primaryButton}>
                        {busy && <Loader2 className="h-3 w-3 animate-spin" />} Firmar contrato
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Este contrato no está disponible para firma en este momento.</p>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}

export function ContractsSection({ slug, token, me, onChanged, onSessionLost }: SectionProps & { onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState<PortalContractItem | null>(null);
  return (
    <Card icon={<FileSignature className="h-4 w-4" />} title="Mis contratos" hint="Lee el contrato y fírmalo con un código de confirmación.">
      <ul className="divide-y divide-border">
        {me.contracts.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{c.title ?? "Contrato"} {c.number && <span className="text-xs font-normal text-muted-foreground">· {c.number}</span>}</p>
              <p className="text-xs text-muted-foreground">
                {formatMoney(c.rate, c.currency)} por respuesta · {formatDate(c.startDate)} → {c.endDate ? formatDate(c.endDate) : "sin fecha de fin"}
              </p>
            </div>
            {c.signatureStatus === "signed" ? (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800 dark:bg-green-500/20 dark:text-green-200">Firmado</span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">Pendiente de firma</span>
            )}
            <button type="button" onClick={() => setOpen(c)} className={c.canSign ? primaryButton : secondaryButton}>
              {c.canSign ? "Leer y firmar" : "Ver"}
            </button>
          </li>
        ))}
      </ul>
      {open && <ContractModal slug={slug} token={token} me={me} item={open} onClose={() => setOpen(null)} onSigned={onChanged} onSessionLost={onSessionLost} />}
    </Card>
  );
}
