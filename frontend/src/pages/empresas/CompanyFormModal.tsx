import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import {
  companiesApi,
  EMPLOYEE_RANGE_LABELS,
  ORGANIZATION_TYPE_LABELS,
  SIZE_LABELS,
  type EmployeeRange,
  type Organization,
  type OrganizationInput,
  type OrganizationListItem,
  type OrganizationSize,
  type OrganizationStatus,
  type OrganizationType,
} from "@/services/companies";
import { Field, ModalShell, inputClass, primaryButton, secondaryButton } from "../reclutamiento/shared";

interface Props {
  tenantId: string;
  /** Si se pasa, el formulario edita esa empresa. */
  organization?: Organization;
  /** Cantidad de sucursales de la empresa que se edita (una cadena con sucursales no puede pasar a sucursal). */
  childCount?: number;
  /** Matriz preseleccionada al crear una sucursal. */
  defaultParentId?: string | null;
  onClose: () => void;
  onSaved: (org: Organization) => void;
}

interface PhoneRow {
  number: string;
  label: string;
}

interface FormState {
  name: string;
  legalName: string;
  type: OrganizationType;
  status: OrganizationStatus;
  parentId: string;
  industry: string;
  size: "" | OrganizationSize;
  employeeRange: "" | EmployeeRange;
  documentType: string;
  documentNumber: string;
  phones: PhoneRow[];
  email: string;
  website: string;
  address: string;
  postalCode: string;
  city: string;
  region: string;
  countryCode: string;
  lat: string;
  lng: string;
  openingHours: string;
  tags: string;
  notes: string;
}

const MAX_PHONES = 5;

const toForm = (o?: Organization, defaultParentId?: string | null): FormState => ({
  name: o?.name ?? "",
  legalName: o?.legalName ?? "",
  type: o?.type ?? "establishment",
  status: o?.status ?? "active",
  parentId: o?.parentId ?? defaultParentId ?? "",
  industry: o?.industry ?? "",
  size: o?.size ?? "",
  employeeRange: o?.employeeRange ?? "",
  documentType: o?.documentType ?? "",
  documentNumber: o?.documentNumber ?? "",
  phones: o?.phones?.length ? o.phones.map((p) => ({ number: p.number, label: p.label ?? "" })) : [{ number: "", label: "" }],
  email: o?.email ?? "",
  website: o?.website ?? "",
  address: o?.address ?? "",
  postalCode: o?.postalCode ?? "",
  city: o?.city ?? "",
  region: o?.region ?? "",
  countryCode: o?.countryCode ?? "",
  lat: o?.lat != null ? String(o.lat) : "",
  lng: o?.lng != null ? String(o.lng) : "",
  openingHours: o?.openingHours ?? "",
  tags: o?.tags?.join(", ") ?? "",
  notes: o?.notes ?? "",
});

const text = (v: string) => v.trim() || null;
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

/** Cuerpo completo del formulario, con vacíos como null. */
function toPayload(f: FormState): OrganizationInput {
  return {
    name: f.name.trim(),
    legalName: text(f.legalName),
    type: f.type,
    status: f.status,
    parentId: f.parentId || null,
    industry: text(f.industry),
    size: f.size || null,
    employeeRange: f.employeeRange || null,
    documentType: text(f.documentType),
    documentNumber: text(f.documentNumber),
    phones: f.phones
      .filter((p) => p.number.trim())
      .map((p) => (p.label.trim() ? { number: p.number.trim(), label: p.label.trim() } : { number: p.number.trim() })),
    email: text(f.email),
    website: text(f.website),
    address: text(f.address),
    postalCode: text(f.postalCode),
    city: text(f.city),
    region: text(f.region),
    countryCode: f.countryCode.trim() ? f.countryCode.trim().toUpperCase() : null,
    lat: num(f.lat),
    lng: num(f.lng),
    openingHours: text(f.openingHours),
    tags: f.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    notes: text(f.notes),
  };
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

export function CompanyFormModal({ tenantId, organization, childCount = 0, defaultParentId, onClose, onSaved }: Props) {
  const editing = !!organization;
  const [form, setForm] = useState<FormState>(() => toForm(organization, defaultParentId));
  const [chains, setChains] = useState<OrganizationListItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Matrices posibles: solo empresas sin matriz (la jerarquía es de dos niveles).
  useEffect(() => {
    let alive = true;
    companiesApi
      .list(tenantId, { parentId: "root", limit: 100 })
      .then((res) => alive && setChains(res.data.filter((c) => c.id !== organization?.id)))
      .catch(() => alive && setChains([]));
    return () => {
      alive = false;
    };
  }, [tenantId, organization?.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const field = (key: keyof FormState, max?: number, extra = "") => ({
    value: form[key] as string,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as never),
    maxLength: max,
    className: `${inputClass} ${extra}`.trim(),
  });

  const setPhone = (i: number, patch: Partial<PhoneRow>) =>
    set(
      "phones",
      form.phones.map((p, k) => (k === i ? { ...p, ...patch } : p)),
    );

  const validate = (): string | null => {
    if (form.name.trim().length < 2) return "El nombre debe tener al menos 2 caracteres.";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) return "El correo no es válido.";
    if (form.countryCode.trim() && !/^[A-Za-z]{2}$/.test(form.countryCode.trim())) {
      return "El país debe ser un código de 2 letras (por ejemplo CO).";
    }
    const lat = num(form.lat);
    const lng = num(form.lng);
    if ((lat === null) !== (lng === null)) return "Latitud y longitud deben ir juntas.";
    if (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) return "La latitud debe estar entre -90 y 90.";
    if (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) return "La longitud debe estar entre -180 y 180.";
    if (form.tags.split(",").filter((t) => t.trim()).length > 20) return "Máximo 20 etiquetas.";
    return null;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = toPayload(form);
      if (!organization) {
        onSaved(await companiesApi.create(tenantId, payload));
        return;
      }
      // Al editar solo se envía lo que cambió.
      const initial = toPayload(toForm(organization));
      const diff = Object.fromEntries(
        (Object.keys(payload) as (keyof OrganizationInput)[]).filter((k) => !sameValue(payload[k], initial[k])).map((k) => [k, payload[k]]),
      ) as OrganizationInput;
      if (Object.keys(diff).length === 0) {
        onClose();
        return;
      }
      onSaved(await companiesApi.update(tenantId, organization.id, diff));
    } catch {
      // El interceptor de la API ya muestra el mensaje del servidor.
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={editing ? "Editar empresa" : "Nueva empresa"} onClose={onClose} busy={saving} wide>
      <form onSubmit={submit} noValidate>
        <div className="space-y-5 px-5 py-4">
          <Section title="General">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nombre comercial">
                <input {...field("name", 200)} autoFocus />
              </Field>
              <Field label="Razón social">
                <input {...field("legalName", 200)} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Tipo">
                <DropdownSelect
                  value={form.type}
                  onChange={(v) => set("type", v as OrganizationType)}
                  options={(Object.keys(ORGANIZATION_TYPE_LABELS) as OrganizationType[]).map((t) => ({ value: t, label: ORGANIZATION_TYPE_LABELS[t] }))}
                />
              </Field>
              <Field label="Estado">
                <DropdownSelect
                  value={form.status}
                  onChange={(v) => set("status", v as OrganizationStatus)}
                  options={[
                    { value: "active", label: "Activa" },
                    { value: "inactive", label: "Inactiva" },
                  ]}
                />
              </Field>
              <Field label="Sector o categoría">
                <input {...field("industry", 100)} placeholder="Supermercado, farmacia…" />
              </Field>
            </div>
            <Field
              label="Empresa matriz (cadena)"
              hint={
                childCount > 0
                  ? "Esta empresa tiene sucursales, por eso no puede ser sucursal de otra."
                  : "Déjalo sin matriz si es una cadena o una empresa independiente."
              }
            >
              <div className={childCount > 0 ? "pointer-events-none opacity-50" : undefined}>
                <DropdownSelect
                  value={form.parentId}
                  onChange={(v) => set("parentId", v)}
                  options={[{ value: "", label: "Sin matriz" }, ...chains.map((c) => ({ value: c.id, label: c.name }))]}
                />
              </div>
            </Field>
          </Section>

          <Section title="Tamaño">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Tamaño de la empresa">
                <DropdownSelect
                  value={form.size}
                  onChange={(v) => set("size", v as "" | OrganizationSize)}
                  options={[{ value: "", label: "Sin definir" }, ...(Object.keys(SIZE_LABELS) as OrganizationSize[]).map((s) => ({ value: s, label: SIZE_LABELS[s] }))]}
                />
              </Field>
              <Field label="Número de empleados">
                <DropdownSelect
                  value={form.employeeRange}
                  onChange={(v) => set("employeeRange", v as "" | EmployeeRange)}
                  options={[
                    { value: "", label: "Sin definir" },
                    ...(Object.keys(EMPLOYEE_RANGE_LABELS) as EmployeeRange[]).map((r) => ({ value: r, label: EMPLOYEE_RANGE_LABELS[r] })),
                  ]}
                />
              </Field>
            </div>
          </Section>

          <Section title="Documento">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Tipo de documento">
                <input {...field("documentType", 20)} placeholder="NIT, RUC…" />
              </Field>
              <div className="col-span-2">
                <Field label="Número de documento" hint="No se puede repetir en tu cuenta.">
                  <input {...field("documentNumber", 50)} />
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Contacto">
            <div className="space-y-2">
              <span className="block text-xs font-medium text-foreground">Teléfonos</span>
              {form.phones.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={p.number}
                    onChange={(e) => setPhone(i, { number: e.target.value })}
                    maxLength={30}
                    inputMode="tel"
                    placeholder="+57 300 123 4567"
                    aria-label={`Teléfono ${i + 1}`}
                    className={`${inputClass} flex-1`}
                  />
                  <input
                    value={p.label}
                    onChange={(e) => setPhone(i, { label: e.target.value })}
                    maxLength={30}
                    placeholder="Etiqueta (oficina, gerencia…)"
                    aria-label={`Etiqueta del teléfono ${i + 1}`}
                    className={`${inputClass} flex-1`}
                  />
                  {form.phones.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Quitar teléfono ${i + 1}`}
                      onClick={() => set("phones", form.phones.filter((_, k) => k !== i))}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {form.phones.length < MAX_PHONES && (
                <button
                  type="button"
                  onClick={() => set("phones", [...form.phones, { number: "", label: "" }])}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                >
                  <Plus className="h-3 w-3" /> Agregar teléfono
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Correo">
                <input {...field("email", 200)} type="email" inputMode="email" placeholder="contacto@empresa.com" />
              </Field>
              <Field label="Sitio web">
                <input {...field("website", 300)} placeholder="www.empresa.com" />
              </Field>
            </div>
          </Section>

          <Section title="Ubicación">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Dirección">
                  <input {...field("address", 300)} />
                </Field>
              </div>
              <Field label="Código postal">
                <input {...field("postalCode", 20)} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Ciudad">
                <input {...field("city", 100)} />
              </Field>
              <Field label="Región">
                <input {...field("region", 100)} />
              </Field>
              <Field label="País">
                <input {...field("countryCode", 2, "uppercase")} placeholder="CO" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitud">
                <input {...field("lat")} inputMode="decimal" placeholder="4.6097" />
              </Field>
              <Field label="Longitud">
                <input {...field("lng")} inputMode="decimal" placeholder="-74.0817" />
              </Field>
            </div>
            <Field label="Horario de atención">
              <input {...field("openingHours", 300)} placeholder="Lunes a sábado 8:00 a 20:00" />
            </Field>
          </Section>

          <Section title="Notas">
            <Field label="Etiquetas" hint="Sepáralas con comas. Máximo 20.">
              <input {...field("tags")} placeholder="vip, cadena, prioritario" />
            </Field>
            <Field label="Notas internas">
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                maxLength={2000}
                rows={3}
                className={`${inputClass} resize-y`}
              />
            </Field>
          </Section>

          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {editing ? "Guardar cambios" : "Crear empresa"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
