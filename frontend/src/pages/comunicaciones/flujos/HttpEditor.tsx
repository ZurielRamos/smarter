import { useState } from "react";
import { Eye, EyeOff, Loader2, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/ConfirmModal";
import { NumberField } from "@/components/ui/number-field";
import { FlowSelect, type SelectOption } from "./FlowSelect";
import { ReplaceToggle } from "./ReplaceToggle";
import { VariableInput, VariableTextarea } from "./VariableField";
import { JsonTree } from "./JsonTree";
import { VARIABLE_GROUP_LABELS, type VariableOption } from "./variables";
import {
  HTTP_DEFAULT_TIMEOUT_SEC,
  HTTP_MAX_MAPPINGS,
  HTTP_MAX_PAIRS,
  HTTP_MAX_TIMEOUT_SEC,
  MASKED_HEADER_VALUE,
  defaultHttpConfig,
  extractPlaceholders,
  getHttpSamples,
  getPath,
  isSensitiveHeader,
  previewValue,
  setHttpSample,
  suggestVariableName,
} from "./http";
import {
  flowsApi,
  shortId,
  type FlowHttpConfig,
  type FlowHttpMapping,
  type FlowHttpMethod,
  type FlowHttpPair,
  type FlowNodeData,
} from "./types";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";
const smallInput =
  "w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";
const labelClass = "block text-xs font-medium text-foreground mb-1";
const hintClass = "text-[11px] text-muted-foreground mt-1";

const METHODS: FlowHttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const BODY_TYPES: { value: NonNullable<FlowHttpConfig["bodyType"]>; label: string }[] = [
  { value: "none", label: "Sin cuerpo" },
  { value: "json", label: "JSON" },
  { value: "form", label: "Formulario" },
  { value: "text", label: "Texto" },
];

type Tab = "query" | "headers" | "body";

interface TestResult {
  ok: boolean;
  status: number;
  durationMs: number;
  contentType?: string;
  body?: unknown;
  truncated?: boolean;
  error?: string;
}

interface Props {
  nodeId: string;
  flowId: string;
  tenantId?: string;
  data: FlowNodeData;
  set: (patch: Partial<FlowNodeData>) => void;
  options: VariableOption[];
}

const cleanVariable = (v: string) => v.replace(/[^\w]/g, "").slice(0, 50);

/** Editor del nodo «Petición API». */
export function HttpEditor({ nodeId, flowId, tenantId, data, set, options }: Props) {
  const cfg: FlowHttpConfig = data.http ?? defaultHttpConfig();
  const setCfg = (patch: Partial<FlowHttpConfig>) => set({ http: { ...cfg, ...patch } });
  const [selectedTab, setTab] = useState<Tab>("query");
  const isGet = cfg.method === "GET";
  const tab: Tab = isGet && selectedTab === "body" ? "query" : selectedTab;
  const bodyType = cfg.bodyType ?? "none";
  const mappings = cfg.mappings ?? [];

  // ─── Prueba ───
  const placeholders = extractPlaceholders(cfg);
  const [samples, setSamples] = useState<Record<string, string>>(() => getHttpSamples(flowId));
  const [result, setResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [confirmTest, setConfirmTest] = useState(false);

  const changeSample = (name: string, value: string) => {
    setSamples((s) => ({ ...s, [name]: value }));
    setHttpSample(flowId, name, value);
  };

  const runTest = async () => {
    if (!tenantId || testing) return;
    setTesting(true);
    try {
      const values: Record<string, string> = {};
      for (const p of placeholders) values[p] = samples[p] ?? "";
      const { data: res } = await flowsApi.post<TestResult>("/conversation-flows/http-test", {
        tenantId,
        flowId,
        nodeId,
        config: cfg,
        values,
      });
      setResult(res);
    } catch (err: any) {
      if (err?.response?.status === 429) {
        toast.error("Demasiadas pruebas, espera un minuto");
      } else {
        const msg = err?.response?.data?.message;
        toast.error(Array.isArray(msg) ? msg.join(", ") : msg || "No se pudo ejecutar la prueba");
      }
    } finally {
      setTesting(false);
    }
  };

  const startTest = () => {
    if (!cfg.url.trim()) {
      toast.error("Escribe la URL antes de probar");
      return;
    }
    if (isGet) void runTest();
    else setConfirmTest(true);
  };

  // ─── Mapeos ───
  const setMapping = (id: string, patch: Partial<FlowHttpMapping>) =>
    setCfg({ mappings: mappings.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  const addMapping = (path: string) => {
    if (mappings.length >= HTTP_MAX_MAPPINGS) {
      toast.error(`Máximo ${HTTP_MAX_MAPPINGS} datos`);
      return;
    }
    const variable = suggestVariableName(path, mappings.map((m) => m.variable));
    setCfg({ mappings: [...mappings, { id: shortId("m"), path, variable }] });
  };

  const crmOptions: SelectOption[] = [
    { value: "", label: "No guardar en el CRM" },
    ...options
      .filter((o) => o.writable && (o.group === "crm" || o.group === "custom"))
      .map((o) => ({ value: o.key, label: o.label, hint: o.key, group: VARIABLE_GROUP_LABELS[o.group] })),
  ];

  const jsonBody = result && typeof result.body === "object" && result.body !== null;

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-muted-foreground">
        Llama a una API durante la conversación y guarda campos de la respuesta como variables. El flujo sigue de inmediato,
        sin esperar al contacto.
      </p>

      <Section title="Petición">
        <div className="flex items-center gap-1.5">
          <FlowSelect
            compact
            aria-label="Método"
            value={cfg.method}
            onChange={(v) => setCfg({ method: v as FlowHttpMethod })}
            className="w-24 shrink-0"
            options={METHODS.map((m) => ({ value: m, label: m }))}
          />
          <VariableInput
            aria-label="URL"
            type="url"
            inputMode="url"
            value={cfg.url}
            maxLength={2000}
            onChange={(v) => setCfg({ url: v })}
            placeholder="https://api.ejemplo.com/clientes/{{documento}}"
            className={cn(smallInput, "py-2 font-mono")}
          />
        </div>
        <p className={hintClass}>
          Escribe <code className="font-mono">{"{"}</code> para insertar variables. En la URL se codifican solas.
        </p>

        <div role="tablist" aria-label="Datos de la petición" className="flex gap-1 rounded-lg bg-muted p-1">
          {(
            [
              ["query", "Parámetros", cfg.query?.length],
              ["headers", "Encabezados", cfg.headers?.length],
              ["body", "Cuerpo", undefined],
            ] as const
          )
            .filter(([key]) => key !== "body" || !isGet)
            .map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "flex-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors",
                  tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                {count ? ` (${count})` : ""}
              </button>
            ))}
        </div>

        {tab === "query" && (
          <PairsEditor
            label="Parámetro"
            pairs={cfg.query ?? []}
            onChange={(query) => setCfg({ query })}
            keyPlaceholder="page"
            valuePlaceholder="1"
          />
        )}
        {tab === "headers" && (
          <>
            <PairsEditor
              label="Encabezado"
              pairs={cfg.headers ?? []}
              onChange={(headers) => setCfg({ headers })}
              keyPlaceholder="Authorization"
              valuePlaceholder="Bearer …"
              secretValues
            />
            <p className={hintClass}>
              Los valores de encabezados como Authorization o X-API-Key se ocultan. Quedan guardados en el flujo y solo se
              muestran como «Valor guardado».
            </p>
          </>
        )}
        {tab === "body" && !isGet && (
          <div className="space-y-2">
            <FlowSelect
              compact
              aria-label="Tipo de cuerpo"
              value={bodyType}
              onChange={(v) => setCfg({ bodyType: v as FlowHttpConfig["bodyType"] })}
              options={BODY_TYPES}
            />
            {(bodyType === "json" || bodyType === "text") && (
              <>
                <VariableTextarea
                  aria-label="Cuerpo"
                  rows={6}
                  maxLength={10000}
                  value={cfg.body ?? ""}
                  onChange={(v) => setCfg({ body: v })}
                  placeholder={bodyType === "json" ? '{\n  "nombre": "{{contact_name}}"\n}' : "Texto a enviar"}
                  className={cn(inputClass, "resize-y font-mono text-xs")}
                />
                {bodyType === "json" && (
                  <p className={hintClass}>
                    Las variables van entre comillas como valor, p. ej. <code className="font-mono">{'"{{nombre}}"'}</code>.
                    Se escapan solas, así que comillas o saltos de línea no rompen el JSON.
                  </p>
                )}
              </>
            )}
            {bodyType === "form" && (
              <PairsEditor
                label="Campo"
                pairs={cfg.formFields ?? []}
                onChange={(formFields) => setCfg({ formFields })}
                keyPlaceholder="email"
                valuePlaceholder="{{email}}"
              />
            )}
            {bodyType === "none" && <p className={hintClass}>La petición se envía sin cuerpo.</p>}
          </div>
        )}

        <label className="block">
          <span className={labelClass}>Tiempo de espera (segundos)</span>
          <NumberField
            value={cfg.timeoutSec ?? HTTP_DEFAULT_TIMEOUT_SEC}
            onChange={(n) => setCfg({ timeoutSec: n ?? undefined })}
            min={1}
            max={HTTP_MAX_TIMEOUT_SEC}
            decimals={0}
            placeholder={String(HTTP_DEFAULT_TIMEOUT_SEC)}
          />
        </label>
        <p className={hintClass}>
          Máximo {HTTP_MAX_TIMEOUT_SEC} s por petición y 30 s entre todas las de un mismo turno. La conversación espera la
          respuesta.
        </p>
      </Section>

      <Section title="Probar">
        {placeholders.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground">Valores de ejemplo para esta prueba:</p>
            {placeholders.map((p) => (
              <label key={p} className="flex items-center gap-1.5">
                <code className="w-24 shrink-0 truncate font-mono text-[11px] text-muted-foreground" title={`{{${p}}}`}>
                  {p}
                </code>
                <input
                  aria-label={`Valor de ejemplo de ${p}`}
                  value={samples[p] ?? ""}
                  onChange={(e) => changeSample(p, e.target.value)}
                  className={smallInput}
                />
              </label>
            ))}
            <p className={hintClass}>Solo se usan en la prueba. No se guardan en el flujo.</p>
          </div>
        )}
        <button
          type="button"
          onClick={startTest}
          disabled={testing || !tenantId}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand-300 px-3 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-50 dark:text-brand-200 dark:hover:bg-brand-700/30"
        >
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {testing ? "Probando…" : "Probar"}
        </button>

        {result && (
          <div className="space-y-2" aria-live="polite">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono font-semibold",
                  result.ok
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
                )}
              >
                {result.status || "Sin respuesta"}
              </span>
              <span className="text-muted-foreground">{result.durationMs} ms</span>
              {result.truncated && <span className="text-amber-600 dark:text-amber-400">Respuesta recortada</span>}
            </div>
            {result.error && <p className="text-[11px] text-red-600 dark:text-red-400">{result.error}</p>}
            {result.body !== undefined &&
              result.body !== null &&
              (jsonBody ? (
                <>
                  <JsonTree value={result.body} onPick={(path) => addMapping(path)} />
                  <p className={hintClass}>Pulsa un campo para guardarlo en una variable.</p>
                </>
              ) : (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-2 font-mono text-[11px]">
                  {String(result.body)}
                </pre>
              ))}
          </div>
        )}
      </Section>

      <Section title="Guardar respuesta">
        {mappings.length === 0 && (
          <p className={hintClass}>
            {result ? "Pulsa un campo de la respuesta para guardarlo." : "Prueba la petición para elegir los campos de la respuesta."}
          </p>
        )}
        {mappings.map((m, i) => {
          const found = result ? getPath(result.body, m.path) : undefined;
          return (
            <div key={m.id} className="space-y-1.5 rounded-lg border border-border bg-card p-2">
              <div className="flex items-center gap-1.5">
                <input
                  aria-label={`Ruta del dato ${i + 1}`}
                  value={m.path}
                  maxLength={200}
                  onChange={(e) => setMapping(m.id, { path: e.target.value })}
                  placeholder="data.items[0].nombre"
                  className={cn(smallInput, "font-mono")}
                />
                <button
                  type="button"
                  aria-label={`Eliminar dato ${i + 1}`}
                  onClick={() => setCfg({ mappings: mappings.filter((x) => x.id !== m.id) })}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                aria-label={`Variable del dato ${i + 1}`}
                value={m.variable}
                onChange={(e) => setMapping(m.id, { variable: cleanVariable(e.target.value) })}
                placeholder="nombre_cliente"
                className={cn(smallInput, "font-mono")}
              />
              <FlowSelect
                compact
                searchable
                aria-label={`Campo del CRM del dato ${i + 1}`}
                value={m.saveToField || ""}
                onChange={(v) => setMapping(m.id, { saveToField: v || undefined, ...(v ? {} : { keepExisting: undefined }) })}
                placeholder="No guardar en el CRM"
                options={crmOptions}
              />
              {m.saveToField && (
                <ReplaceToggle keepExisting={m.keepExisting} onChange={(keepExisting) => setMapping(m.id, { keepExisting })} />
              )}
              {result && (
                <p className="truncate text-[11px] text-muted-foreground" title={found === undefined || found === null ? undefined : previewValue(found)}>
                  Valor:{" "}
                  {found === undefined || found === null ? (
                    <span className="italic">no encontrado</span>
                  ) : (
                    <span className="font-mono text-foreground">{previewValue(found)}</span>
                  )}
                </p>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => addMapping("$")}
          disabled={mappings.length >= HTTP_MAX_MAPPINGS}
          className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-40 dark:text-brand-300"
        >
          <Plus className="h-3 w-3" />
          Guardar respuesta completa
        </button>
        <p className={hintClass}>
          Con una respuesta 2xx el flujo sigue por <strong>Éxito</strong> y se guarda cada dato en su variable. Con otro estado,
          sigue por <strong>Si falla</strong> y quedan <code className="font-mono">{"{{http_status}}"}</code> y{" "}
          <code className="font-mono">{"{{http_error}}"}</code>. Sin esa salida conectada, la conversación termina ahí.
        </p>
      </Section>

      <ConfirmModal
        open={confirmTest}
        onClose={() => setConfirmTest(false)}
        onConfirm={async () => {
          setConfirmTest(false);
          await runTest();
        }}
        title="Probar petición"
        description="La petición se enviará de verdad y puede crear o modificar datos en el sistema externo."
        confirmLabel="Probar"
        variant="warning"
      />
    </div>
  );
}

/** Lista de pares clave/valor. Con `secretValues`, oculta el valor de los encabezados sensibles. */
function PairsEditor({
  label,
  pairs,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
  secretValues,
}: {
  label: string;
  pairs: FlowHttpPair[];
  onChange: (pairs: FlowHttpPair[]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
  secretValues?: boolean;
}) {
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set());
  const update = (i: number, patch: Partial<FlowHttpPair>) => onChange(pairs.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const toggleReveal = (i: number) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const remove = (i: number) => {
    onChange(pairs.filter((_, j) => j !== i));
    setRevealed(new Set());
  };

  return (
    <div className="space-y-1.5">
      {pairs.map((p, i) => {
        const secret = !!secretValues && isSensitiveHeader(p.key);
        const saved = secret && p.value === MASKED_HEADER_VALUE;
        const show = revealed.has(i);
        return (
          <div key={i} className="flex items-center gap-1">
            <input
              aria-label={`${label} ${i + 1}: nombre`}
              value={p.key}
              maxLength={100}
              onChange={(e) => update(i, { key: e.target.value })}
              placeholder={keyPlaceholder}
              className={cn(smallInput, "w-2/5 shrink-0 font-mono")}
            />
            {saved ? (
              <div className="flex min-w-0 flex-1 items-center justify-between gap-1 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs">
                <span className="truncate text-muted-foreground">Valor guardado</span>
                <button
                  type="button"
                  aria-label={`Reemplazar el valor de ${p.key}`}
                  onClick={() => update(i, { value: "" })}
                  className="shrink-0 font-medium text-brand-700 hover:underline dark:text-brand-300"
                >
                  Reemplazar
                </button>
              </div>
            ) : secret && !show ? (
              <>
                <input
                  type="password"
                  autoComplete="off"
                  aria-label={`${label} ${i + 1}: valor`}
                  value={p.value}
                  maxLength={2000}
                  onChange={(e) => update(i, { value: e.target.value })}
                  placeholder={valuePlaceholder}
                  className={cn(smallInput, "min-w-0 flex-1 font-mono")}
                />
                <RevealButton shown={false} onClick={() => toggleReveal(i)} />
              </>
            ) : (
              <>
                <VariableInput
                  aria-label={`${label} ${i + 1}: valor`}
                  value={p.value}
                  maxLength={2000}
                  onChange={(v) => update(i, { value: v })}
                  placeholder={valuePlaceholder}
                  className={cn(smallInput, "font-mono")}
                />
                {secret && <RevealButton shown onClick={() => toggleReveal(i)} />}
              </>
            )}
            <button
              type="button"
              aria-label={`Eliminar ${label.toLowerCase()} ${i + 1}`}
              onClick={() => remove(i)}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...pairs, { key: "", value: "" }])}
        disabled={pairs.length >= HTTP_MAX_PAIRS}
        className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-40 dark:text-brand-300"
      >
        <Plus className="h-3 w-3" />
        {pairs.length >= HTTP_MAX_PAIRS ? `Máximo ${HTTP_MAX_PAIRS}` : `Agregar ${label.toLowerCase()}`}
      </button>
    </div>
  );
}

function RevealButton({ shown, onClick }: { shown: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={shown ? "Ocultar valor" : "Mostrar valor"}
      onClick={onClick}
      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {shown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}
