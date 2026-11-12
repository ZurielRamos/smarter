import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { KeyRound, Loader2, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { ConfirmModal } from "@/components/ConfirmModal";
import { automationsApi, type AutomationConnection, type ConnectionTypeDef } from "@/services/automatizaciones";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";

export function AutomationConnections() {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantId = user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenantId;

  const [items, setItems] = useState<AutomationConnection[]>([]);
  const [types, setTypes] = useState<ConnectionTypeDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AutomationConnection | "new" | null>(null);
  const [toDelete, setToDelete] = useState<AutomationConnection | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    Promise.all([automationsApi.connections(tenantId), automationsApi.connectionTypes(tenantId)])
      .then(([c, t]) => {
        setItems(c);
        setTypes(t);
      })
      .catch(() => toast.error("No se pudieron cargar las conexiones"))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const typeLabel = (t: string) => types.find((x) => x.type === t)?.label ?? t;

  const handleDelete = async () => {
    if (!tenantId || !toDelete) return;
    await automationsApi.removeConnection(toDelete.id, tenantId);
    setItems((prev) => prev.filter((c) => c.id !== toDelete.id));
    setToDelete(null);
    toast.success("Conexión eliminada");
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Conexiones</h2>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3 w-3" /> Las credenciales se guardan cifradas y no se vuelven a mostrar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-600"
        >
          <Plus className="h-3.5 w-3.5" /> Nueva conexión
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" />
          </div>
        ) : items.length === 0 ? (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <KeyRound className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">Sin conexiones</p>
            <p className="mt-1 text-xs text-muted-foreground">Crea conexiones para Slack, Discord, Telegram, IA o APIs con autenticación y reutilízalas en tus flujos.</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((c) => (
              <li key={c.id} className="flex items-start gap-3 rounded-xl border border-border bg-background p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500 text-white">
                  <KeyRound className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{typeLabel(c.type)}</p>
                </div>
                <button type="button" aria-label={`Editar ${c.name}`} onClick={() => setEditing(c)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label={`Eliminar ${c.name}`} onClick={() => setToDelete(c)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && tenantId && (
        <ConnectionModal
          tenantId={tenantId}
          types={types}
          connection={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(c) => {
            setItems((prev) => (prev.some((p) => p.id === c.id) ? prev.map((p) => (p.id === c.id ? c : p)) : [...prev, c]));
            setEditing(null);
            toast.success("Conexión guardada");
          }}
        />
      )}

      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        title="Eliminar conexión"
        description={`Las automatizaciones que usan «${toDelete?.name}» fallarán hasta que elijan otra conexión.`}
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  );
}

function ConnectionModal({
  tenantId,
  types,
  connection,
  onClose,
  onSaved,
}: {
  tenantId: string;
  types: ConnectionTypeDef[];
  connection: AutomationConnection | null;
  onClose: () => void;
  onSaved: (c: AutomationConnection) => void;
}) {
  const [type, setType] = useState(connection?.type ?? types[0]?.type ?? "");
  const [name, setName] = useState(connection?.name ?? "");
  const [data, setData] = useState<Record<string, string>>(connection?.visible ?? {});
  const [saving, setSaving] = useState(false);
  const def = types.find((t) => t.type === type);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !def || saving) return;
    setSaving(true);
    try {
      const saved = connection
        ? await automationsApi.updateConnection(connection.id, tenantId, { name: name.trim(), data })
        : await automationsApi.createConnection(tenantId, { name: name.trim(), type, data });
      onSaved(saved);
    } catch {
      /* el interceptor muestra el error */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="conn-title">
      <div className="absolute inset-0 bg-black/40" onClick={saving ? undefined : onClose} />
      <form onSubmit={submit} className="relative mx-4 w-full max-w-md overflow-hidden rounded-2xl bg-card text-card-foreground shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 id="conn-title" className="text-sm font-semibold text-foreground">{connection ? "Editar conexión" : "Nueva conexión"}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div>
            <label htmlFor="conn-type" className="mb-1 block text-xs font-medium text-foreground">Servicio</label>
            <select id="conn-type" value={type} disabled={!!connection} onChange={(e) => { setType(e.target.value); setData({}); }} className={inputClass}>
              {types.map((t) => (
                <option key={t.type} value={t.type}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="conn-name" className="mb-1 block text-xs font-medium text-foreground">Nombre</label>
            <input id="conn-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Slack · #ventas" maxLength={255} className={inputClass} />
          </div>
          {def?.fields.map((f) => {
            const isSet = connection?.secretsSet.includes(f.key);
            return (
              <div key={f.key}>
                <label htmlFor={`cf-${f.key}`} className="mb-1 block text-xs font-medium text-foreground">{f.label}</label>
                <input
                  id={`cf-${f.key}`}
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  value={data[f.key] ?? ""}
                  onChange={(e) => setData((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.secret && isSet ? "•••••••• (déjalo vacío para conservarlo)" : ""}
                  className={inputClass}
                />
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={!name.trim() || saving} className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            {saving && <Loader2 className="h-3 w-3 animate-spin" />} Guardar
          </button>
        </div>
      </form>
    </div>
  );
}
