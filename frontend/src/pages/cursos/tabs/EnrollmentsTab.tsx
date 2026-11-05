import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Users, UserPlus, X, Search, Check } from "lucide-react";
import { getClients, type ClientRecord } from "@/services/api";
import {
  listEnrollments,
  createEnrollments,
  type Course,
  type CourseEnrollment,
} from "@/services/cursos";

const STATUS_STYLES: Record<string, string> = {
  invited: "bg-gray-100 text-gray-600 dark:bg-gray-500/15",
  in_progress: "bg-blue-50 text-blue-700 dark:bg-blue-500/15",
  completed: "bg-amber-50 text-amber-700 dark:bg-amber-500/15",
  passed: "bg-green-50 text-green-700 dark:bg-green-500/15",
  failed: "bg-red-50 text-red-700 dark:bg-red-500/15",
  disqualified: "bg-red-50 text-red-700 dark:bg-red-500/15",
};

const STATUS_LABEL: Record<string, string> = {
  invited: "Invitado",
  in_progress: "En progreso",
  completed: "Completado",
  passed: "Aprobado",
  failed: "Reprobado",
  disqualified: "Descalificado",
};

export function EnrollmentsTab({ course }: { course: Course }) {
  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);

  const refresh = () => {
    setLoading(true);
    listEnrollments(course.id)
      .then(setEnrollments)
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [course.id]);

  const participantName = (e: CourseEnrollment) => {
    const d = e.participantData || {};
    return (
      d.fullName ||
      [d.firstName, d.lastName].filter(Boolean).join(" ") ||
      d.email ||
      d.phone ||
      "Sin datos aún"
    );
  };

  const publicLink = (e: CourseEnrollment) =>
    course.slug ? `${window.location.origin}/c/${course.slug}?t=${e.accessToken}` : "";

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase">
          Participantes ({enrollments.length})
        </h4>
        <button
          onClick={() => setShowPicker(true)}
          disabled={course.status !== "active"}
          title={course.status !== "active" ? "Publica el curso primero" : ""}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Inscribir contactos
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : enrollments.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-12">
          <Users className="h-6 w-6 text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">Aún no hay participantes inscritos.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Participante</th>
                <th className="text-left px-3 py-2 font-medium">Estado</th>
                <th className="text-right px-3 py-2 font-medium">Puntaje</th>
                <th className="text-right px-3 py-2 font-medium">Clases</th>
                <th className="text-right px-3 py-2 font-medium">Enlace</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-3 py-2">{participantName(e)}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[e.status] || ""}`}>
                      {STATUS_LABEL[e.status] || e.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{e.weightedScore.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{e.completedLessons}</td>
                  <td className="px-3 py-2 text-right">
                    {publicLink(e) && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(publicLink(e));
                          toast.success("Enlace del participante copiado");
                        }}
                        className="text-[11px] text-brand-600 hover:underline"
                      >
                        Copiar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPicker && (
        <ContactPicker
          tenantId={course.tenantId}
          existing={new Set(enrollments.map((e) => e.recordId).filter(Boolean) as string[])}
          onClose={() => setShowPicker(false)}
          onEnroll={async (recordIds) => {
            await createEnrollments(course.id, { recordIds });
            toast.success(`${recordIds.length} participante(s) inscrito(s)`);
            setShowPicker(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ContactPicker({
  tenantId,
  existing,
  onClose,
  onEnroll,
}: {
  tenantId: string;
  existing: Set<string>;
  onClose: () => void;
  onEnroll: (recordIds: string[]) => Promise<void>;
}) {
  const [contacts, setContacts] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getClients(tenantId, 1, 100)
      .then((res) => setContacts(res.data ?? []))
      .catch(() => setContacts([]))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const filtered = contacts.filter((c) => {
    const name = `${c.fullName ?? ""} ${c.firstName ?? ""} ${c.lastName ?? ""} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase();
    return name.includes(query.toLowerCase());
  });

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h3 className="text-sm font-semibold">Inscribir contactos</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-3 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar contacto..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-brand-300"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sin contactos</p>
          ) : (
            filtered.map((c) => {
              const already = c.id ? existing.has(c.id) : false;
              const isSel = c.id ? selected.has(c.id) : false;
              return (
                <button
                  key={c.id}
                  disabled={already}
                  onClick={() => c.id && toggle(c.id)}
                  className={`w-full flex items-center gap-2.5 px-5 py-2 text-left hover:bg-muted disabled:opacity-40 ${
                    isSel ? "bg-brand-50 dark:bg-brand-700/30" : ""
                  }`}
                >
                  <div
                    className={`h-4 w-4 rounded border shrink-0 flex items-center justify-center ${
                      isSel ? "bg-brand-600 border-brand-600 text-white" : "border-border"
                    }`}
                  >
                    {isSel && <Check className="h-3 w-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">
                      {c.fullName || [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || c.phone || "Contacto"}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{c.email || c.phone}</p>
                  </div>
                  {already && <span className="text-[10px] text-muted-foreground">Ya inscrito</span>}
                </button>
              );
            })
          )}
        </div>
        <div className="px-5 py-4 border-t border-border flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground">{selected.size} seleccionado(s)</span>
          <button
            onClick={async () => {
              setSaving(true);
              try {
                await onEnroll([...selected]);
              } finally {
                setSaving(false);
              }
            }}
            disabled={selected.size === 0 || saving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Inscribir
          </button>
        </div>
      </div>
    </div>
  );
}
