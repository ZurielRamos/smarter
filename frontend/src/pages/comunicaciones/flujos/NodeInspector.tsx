import { useContext, useRef, useState } from "react";
import { ExternalLink, FileText, Loader2, Phone, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FlowVariablesContext } from "./editorContext";
import { VariableInput, VariableTextarea } from "./VariableField";
import {
  ACTION_LABELS,
  HEADER_ACCEPT,
  HEADER_TYPE_LABELS,
  MAX_ACTION_BUTTONS,
  MAX_ACTION_TITLE,
  flowsApi,
  type FlowButton,
  type FlowButtonType,
  type FlowHeaderType,
  MAX_BUTTONS,
  MAX_BUTTON_TITLE,
  MAX_HEADER_FOOTER,
  NODE_LABELS,
  OPERATOR_LABELS,
  VALIDATION_LABELS,
  WA_REPLY_BUTTON_TITLE,
  shortId,
  type ConversationFlowSummary,
  type FlowAction,
  type FlowActionType,
  type FlowConditionOperator,
  type FlowInputValidation,
  type FlowNodeData,
  type FlowNodeType,
  type LabelOption,
} from "./types";

const inputClass =
  "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";
const labelClass = "block text-xs font-medium text-foreground mb-1";
const hintClass = "text-[11px] text-muted-foreground mt-1";

interface NodeInspectorProps {
  nodeId: string;
  type: FlowNodeType;
  data: FlowNodeData;
  flows: ConversationFlowSummary[];
  currentFlowId: string;
  labels: LabelOption[];
  variables: string[];
  tenantId?: string;
  /** null = aún no se sabe; false = el servidor no puede generar enlaces públicos */
  linkTracking: boolean | null;
  onChange: (data: FlowNodeData) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function NodeInspector({
  nodeId,
  type,
  data,
  flows,
  currentFlowId,
  labels,
  variables,
  tenantId,
  linkTracking,
  onChange,
  onDelete,
  onClose,
}: NodeInspectorProps) {
  const set = (patch: Partial<FlowNodeData>) => onChange({ ...data, ...patch });
  const variableListId = `vars-${nodeId}`;
  const allVariables = useContext(FlowVariablesContext);

  return (
    <aside className="w-80 shrink-0 border-l border-border bg-card flex flex-col min-h-0" aria-label="Editar nodo">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{NODE_LABELS[type]}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar panel"
          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <datalist id={variableListId}>
        {variables.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      {/* La condición puede evaluar también cualquier campo del CRM. */}
      <datalist id={`${nodeId}-condition-vars`}>
        {allVariables
          .filter((o) => o.key !== "contact_name")
          .map((o) => (
            <option key={o.key} value={o.key} label={o.label} />
          ))}
      </datalist>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {type === "start" && (
          <p className="text-xs text-muted-foreground">
            Punto de entrada del flujo. Conecta su salida con el primer paso. Los disparadores (palabras clave, conversación
            nueva) se configuran en el botón <strong>Disparadores</strong> de la barra superior.
          </p>
        )}

        {type === "message" && <MessageFields data={data} set={set} tenantId={tenantId} linkTracking={linkTracking} />}

        {type === "user_input" && (
          <>
            <div>
              <label className={labelClass} htmlFor={`${nodeId}-text`}>
                Pregunta
              </label>
              <VariableTextarea
                id={`${nodeId}-text`}
                rows={4}
                value={data.text || ""}
                onChange={(v) => set({ text: v })}
                placeholder="¿Cuál es tu correo electrónico?"
                className={cn(inputClass, "resize-y")}
              />
              <VariableHint />
            </div>
            <div>
              <label className={labelClass} htmlFor={`${nodeId}-var`}>
                Guardar respuesta en la variable
              </label>
              <input
                id={`${nodeId}-var`}
                list={variableListId}
                value={data.variable || ""}
                onChange={(e) => set({ variable: e.target.value.replace(/[^\w]/g, "") })}
                placeholder="email"
                className={cn(inputClass, "font-mono")}
              />
              <p className={hintClass}>Letras, números y guion bajo. Úsala luego como {"{{variable}}"}.</p>
            </div>
            <div>
              <label className={labelClass} htmlFor={`${nodeId}-val`}>
                Validación
              </label>
              <select
                id={`${nodeId}-val`}
                value={data.validation || "any"}
                onChange={(e) => set({ validation: e.target.value as FlowInputValidation })}
                className={inputClass}
              >
                {Object.entries(VALIDATION_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor={`${nodeId}-err`}>
                Mensaje si la respuesta no es válida
              </label>
              <VariableInput
                id={`${nodeId}-err`}
                value={data.errorMessage || ""}
                onChange={(v) => set({ errorMessage: v })}
                placeholder="Por favor escribe un correo válido."
                className={inputClass}
              />
              <p className={hintClass}>Tras 3 respuestas no válidas el flujo deja la conversación al bot o al agente.</p>
            </div>
          </>
        )}

        {type === "action" && (
          <ActionFields data={data} set={set} labels={labels} variableListId={variableListId} />
        )}

        {type === "condition" && (
          <>
            <div>
              <label className={labelClass} htmlFor={`${nodeId}-cvar`}>
                Variable
              </label>
              <input
                id={`${nodeId}-cvar`}
                list={`${nodeId}-condition-vars`}
                value={data.conditionVariable || ""}
                onChange={(e) => set({ conditionVariable: e.target.value.replace(/[^\w]/g, "") })}
                placeholder="last_button"
                className={cn(inputClass, "font-mono")}
              />
              <p className={hintClass}>
                Puede ser una variable del flujo o cualquier campo del CRM (p. ej.{" "}
                <code className="font-mono">city</code>). <code className="font-mono">last_button</code> guarda el título del
                último botón pulsado.
              </p>
            </div>
            <div>
              <label className={labelClass} htmlFor={`${nodeId}-op`}>
                Operador
              </label>
              <select
                id={`${nodeId}-op`}
                value={data.conditionOperator || "equals"}
                onChange={(e) => set({ conditionOperator: e.target.value as FlowConditionOperator })}
                className={inputClass}
              >
                {Object.entries(OPERATOR_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            {data.conditionOperator !== "is_set" && data.conditionOperator !== "is_not_set" && (
              <div>
                <label className={labelClass} htmlFor={`${nodeId}-cval`}>
                  Valor
                </label>
                <VariableInput
                  id={`${nodeId}-cval`}
                  value={data.conditionValue || ""}
                  onChange={(v) => set({ conditionValue: v })}
                  className={inputClass}
                />
                <p className={hintClass}>
                  No distingue mayúsculas ni tildes. Escribe <code className="font-mono">{"{"}</code> para comparar con otra
                  variable o campo del CRM.
                </p>
              </div>
            )}
          </>
        )}

        {type === "start_flow" && (
          <div>
            <label className={labelClass} htmlFor={`${nodeId}-flow`}>
              Flujo a iniciar
            </label>
            <select
              id={`${nodeId}-flow`}
              value={data.targetFlowId || ""}
              onChange={(e) => set({ targetFlowId: e.target.value || undefined })}
              className={inputClass}
            >
              <option value="">Selecciona un flujo…</option>
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.id === currentFlowId ? " (este flujo)" : ""}
                </option>
              ))}
            </select>
            <p className={hintClass}>
              El contacto continúa en el inicio del flujo seleccionado. Las variables se conservan. El flujo destino no
              necesita estar activo.
            </p>
          </div>
        )}
      </div>

      {type !== "start" && (
        <div className="px-4 py-3 border-t border-border">
          <button
            type="button"
            onClick={onDelete}
            className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-500/30 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar nodo
          </button>
        </div>
      )}
    </aside>
  );
}

function VariableHint() {
  return (
    <p className={hintClass}>
      Escribe <code className="font-mono">{"{"}</code> para insertar una variable: campos del CRM, campos personalizados o
      respuestas del flujo.
    </p>
  );
}

/** Input de una línea con contador y límite de WhatsApp (60). */
function LimitedField({
  id,
  label,
  value,
  placeholder,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className={labelClass.replace(" mb-1", "")} htmlFor={id}>
          {label} <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <span className="text-[10px] text-muted-foreground">
          {value.length}/{MAX_HEADER_FOOTER}
        </span>
      </div>
      <VariableInput
        id={id}
        value={value}
        maxLength={MAX_HEADER_FOOTER}
        onChange={onChange}
        placeholder={placeholder}
        className={inputClass}
      />
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  );
}

/** Encabezado del mensaje: texto o archivo (imagen, video, documento). */
function HeaderFields({
  data,
  set,
  tenantId,
  buttonCount,
}: {
  data: FlowNodeData;
  set: (p: Partial<FlowNodeData>) => void;
  tenantId?: string;
  buttonCount: number;
}) {
  const type: FlowHeaderType = data.headerType || "text";
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const changeType = (t: FlowHeaderType) => {
    // Cambiar de tipo descarta el valor anterior para no enviar un encabezado inesperado.
    if (t === type) return;
    set({ headerType: t, header: undefined, headerMediaUrl: undefined, headerMediaName: undefined });
  };

  const upload = async (file: File) => {
    if (!tenantId) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data: res } = await flowsApi.post<{ url: string; type: FlowHeaderType; filename: string }>(
        "/conversation-flows/upload-media",
        form,
        { params: { tenantId } },
      );
      set({ headerType: res.type, headerMediaUrl: res.url, headerMediaName: res.filename, header: undefined });
      toast.success("Archivo subido");
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg || "No se pudo subir el archivo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <span className={labelClass}>
        Encabezado <span className="text-muted-foreground font-normal">(opcional)</span>
      </span>
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1 mb-2" role="radiogroup" aria-label="Tipo de encabezado">
        {(Object.keys(HEADER_TYPE_LABELS) as FlowHeaderType[]).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => changeType(t)}
            className={cn(
              "rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors",
              type === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {HEADER_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {type === "text" ? (
        <LimitedField
          id="msg-header"
          label="Texto del encabezado"
          value={data.header || ""}
          placeholder="Soporte Inkttex"
          onChange={(v) => set({ header: v })}
        />
      ) : (
        <div className="space-y-2">
          {data.headerMediaUrl ? (
            <div className="rounded-lg border border-border overflow-hidden">
              {type === "image" && <img src={data.headerMediaUrl} alt="Encabezado" className="w-full max-h-40 object-cover" />}
              {type === "video" && <video src={data.headerMediaUrl} controls className="w-full max-h-40 bg-black" />}
              {type === "document" && (
                <a
                  href={data.headerMediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 text-xs text-brand-600 dark:text-brand-200 hover:underline"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{data.headerMediaName || "Documento"}</span>
                </a>
              )}
              <div className="flex border-t border-border">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex-1 px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  Reemplazar
                </button>
                <button
                  type="button"
                  onClick={() => set({ headerMediaUrl: undefined, headerMediaName: undefined })}
                  className="flex-1 px-3 py-1.5 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 border-l border-border"
                >
                  Quitar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || !tenantId}
              className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-3 py-5 text-xs text-muted-foreground hover:border-brand-300 hover:bg-muted transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
              {uploading
                ? type === "video"
                  ? "Procesando video… puede tardar"
                  : "Subiendo…"
                : `Subir ${HEADER_TYPE_LABELS[type].toLowerCase()}`}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={HEADER_ACCEPT[type]}
            className="hidden"
            aria-label={`Archivo de ${HEADER_TYPE_LABELS[type].toLowerCase()}`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
          <p className={hintClass}>
            {type === "image" && "Se convierte a JPEG. "}
            {type === "video" && "Se recodifica a MP4 compatible con Android, máx. 16 MB. "}
            {buttonCount > 3
              ? "Con más de 3 respuestas, elige abajo cómo mostrarlas (WhatsApp no admite archivo junto a una lista). "
              : ""}
            En Messenger/Instagram se envía como adjunto antes del mensaje; en chat web como enlace.
          </p>
        </div>
      )}
    </div>
  );
}

const BUTTON_TYPE_LABELS: Record<FlowButtonType, string> = {
  reply: "Respuesta",
  url: "Enlace",
  call: "Llamar",
};

const isReplyButton = (b: FlowButton) => (b.type ?? "reply") === "reply";

/** Misma regla que el backend: http(s) literal; admite {{variables}} en el resto. */
function isValidUrl(value: string): boolean {
  const v = value.replace(/\{\{\s*[\w.]+\s*\}\}/g, "x");
  try {
    const u = new URL(v);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname && !/\s/.test(v);
  } catch {
    return false;
  }
}

function isValidPhone(value: string): boolean {
  // Debe llevar «+» y código de país (sin él, un número local marcaría otro país).
  if (!/^\+[\d\s\-().]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}

function MessageFields({
  data,
  set,
  tenantId,
  linkTracking,
}: {
  data: FlowNodeData;
  set: (p: Partial<FlowNodeData>) => void;
  tenantId?: string;
  linkTracking: boolean | null;
}) {
  const replyCount = (data.buttons || []).filter(isReplyButton).length;

  return (
    <>
      <HeaderFields data={data} set={set} tenantId={tenantId} buttonCount={replyCount} />
      <div>
        <label className={labelClass} htmlFor="msg-text">
          Texto
        </label>
        <VariableTextarea
          id="msg-text"
          rows={5}
          value={data.text || ""}
          onChange={(v) => set({ text: v })}
          placeholder="¡Hola! ¿En qué podemos ayudarte?"
          className={cn(inputClass, "resize-y")}
        />
        <VariableHint />
      </div>

      <LimitedField
        id="msg-footer"
        label="Pie de mensaje"
        value={data.footer || ""}
        placeholder="Responde con una opción"
        onChange={(v) => set({ footer: v })}
        hint="En WhatsApp con botones se muestran nativos; en el resto se añaden al texto."
      />

      <ButtonsEditor data={data} set={set} linkTracking={linkTracking} />
    </>
  );
}

/** Editor de botones: respuesta (ramifican el flujo), enlace y llamada. */
function ButtonsEditor({
  data,
  set,
  linkTracking,
}: {
  data: FlowNodeData;
  set: (p: Partial<FlowNodeData>) => void;
  linkTracking: boolean | null;
}) {
  const buttons = data.buttons || [];
  const replies = buttons.filter(isReplyButton);
  const actions = buttons.filter((b) => !isReplyButton(b));
  const hasMediaHeader = !!data.headerMediaUrl && !!data.headerType && data.headerType !== "text";
  const overflow = data.overflow ?? "paginate";

  const update = (id: string, patch: Partial<FlowButton>) =>
    set({ buttons: buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)) });

  const add = (type: FlowButtonType) =>
    set({
      buttons: [
        ...buttons,
        { id: shortId("b"), title: "", type, ...(type === "url" ? { url: "" } : type === "call" ? { phone: "" } : {}) },
      ],
    });

  const changeType = (b: FlowButton, type: FlowButtonType) => {
    if (type === (b.type ?? "reply")) return;
    // Los campos del tipo anterior se descartan para no enviar datos inesperados.
    set({
      buttons: buttons.map((x) =>
        x.id === b.id
          ? { id: x.id, title: x.title.slice(0, type === "reply" ? MAX_BUTTON_TITLE : MAX_ACTION_TITLE), type, ...(type === "url" ? { url: "" } : type === "call" ? { phone: "" } : {}) }
          : x,
      ),
    });
  };

  const limitFor = (b: FlowButton) =>
    isReplyButton(b) ? (replies.length <= 3 ? WA_REPLY_BUTTON_TITLE : MAX_BUTTON_TITLE) : MAX_ACTION_TITLE;

  const hasUrl = actions.some((a) => a.type === "url");
  const hasCall = actions.some((a) => a.type === "call");

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className={labelClass}>
          Botones{" "}
          <span className="font-normal text-muted-foreground">
            ({replies.length}/{MAX_BUTTONS} respuestas · {actions.length}/{MAX_ACTION_BUTTONS} enlaces)
          </span>
        </span>
      </div>

      {buttons.length === 0 ? (
        <p className={hintClass}>Sin botones, el flujo continúa directamente al siguiente paso.</p>
      ) : (
        <div className="space-y-2.5">
          {buttons.map((b, i) => {
            const type = b.type ?? "reply";
            const limit = limitFor(b);
            const over = b.title.length > limit;
            const urlBad = type === "url" && !!b.url && !isValidUrl(b.url.trim());
            const phoneBad = type === "call" && !!b.phone && !isValidPhone(b.phone.trim());
            return (
              <div key={b.id} className="rounded-lg border border-border p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label={`Tipo del botón ${i + 1}`}
                    value={type}
                    onChange={(e) => changeType(b, e.target.value as FlowButtonType)}
                    className={cn(inputClass, "w-[6.5rem] shrink-0 py-1.5 px-2 text-xs")}
                  >
                    {(Object.keys(BUTTON_TYPE_LABELS) as FlowButtonType[]).map((t) => (
                      <option key={t} value={t}>
                        {BUTTON_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <VariableInput
                    aria-label={`Título del botón ${i + 1}`}
                    value={b.title}
                    onChange={(v) => update(b.id, { title: v.slice(0, MAX_BUTTON_TITLE) })}
                    placeholder={type === "reply" ? `Opción ${replies.indexOf(b) + 1}` : type === "url" ? "Ver catálogo" : "Llamar"}
                    className={cn(inputClass, "py-1.5", over && "border-amber-400")}
                  />
                  <button
                    type="button"
                    aria-label={`Eliminar botón ${i + 1}`}
                    onClick={() => set({ buttons: buttons.filter((x) => x.id !== b.id) })}
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {type === "url" && (
                  <div>
                    <VariableInput
                      aria-label={`Enlace del botón ${i + 1}`}
                      type="url"
                      inputMode="url"
                      value={b.url || ""}
                      onChange={(v) => update(b.id, { url: v })}
                      placeholder="https://tuweb.com/catalogo"
                      aria-invalid={urlBad}
                      className={cn(inputClass, "py-1.5 font-mono text-xs", urlBad && "border-red-400")}
                    />
                    {urlBad && <p className="text-[10px] mt-0.5 text-red-600 dark:text-red-400">Debe empezar por http:// o https://</p>}
                    <label className="mt-1.5 flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={b.track !== false}
                        onChange={(e) => update(b.id, { track: e.target.checked ? undefined : false })}
                        className="mt-0.5 accent-brand-600"
                      />
                      <span className="text-[11px]">
                        <span className="font-medium text-foreground">Rastrear clics</span>{" "}
                        <span className="text-muted-foreground">
                          Registra cuándo lo abre el contacto y habilita la salida «al abrir» para continuar el flujo.
                        </span>
                      </span>
                    </label>
                    {b.track !== false && linkTracking === false && (
                      <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
                        El servidor no tiene un origen público https (PUBLIC_BASE_URL): este enlace se enviará sin seguimiento.
                      </p>
                    )}
                  </div>
                )}
                {type === "call" && (
                  <div>
                    <input
                      aria-label={`Teléfono del botón ${i + 1}`}
                      type="tel"
                      inputMode="tel"
                      value={b.phone || ""}
                      onChange={(e) => update(b.id, { phone: e.target.value })}
                      placeholder="+57 300 123 4567"
                      aria-invalid={phoneBad}
                      className={cn(inputClass, "py-1.5 font-mono text-xs", phoneBad && "border-red-400")}
                    />
                    {phoneBad && <p className="text-[10px] mt-0.5 text-red-600 dark:text-red-400">Empieza por + y el código de país, p. ej. +573001234567</p>}
                  </div>
                )}

                <p className={cn("text-[10px] text-right", over ? "text-amber-600" : "text-muted-foreground")}>
                  {b.title.length}/{limit}
                  {over && " · se recortará"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={replies.length >= MAX_BUTTONS}
          onClick={() => add("reply")}
          className="flex items-center gap-1 rounded-lg border border-dashed border-brand-300 px-2.5 py-1 text-xs font-medium text-brand-600 dark:text-brand-200 hover:bg-brand-50 dark:hover:bg-brand-700/30 transition-colors disabled:opacity-40"
        >
          <Plus className="h-3 w-3" /> Respuesta
        </button>
        <button
          type="button"
          disabled={actions.length >= MAX_ACTION_BUTTONS}
          onClick={() => add("url")}
          className="flex items-center gap-1 rounded-lg border border-dashed border-brand-300 px-2.5 py-1 text-xs font-medium text-brand-600 dark:text-brand-200 hover:bg-brand-50 dark:hover:bg-brand-700/30 transition-colors disabled:opacity-40"
        >
          <ExternalLink className="h-3 w-3" /> Enlace
        </button>
        <button
          type="button"
          disabled={actions.length >= MAX_ACTION_BUTTONS}
          onClick={() => add("call")}
          className="flex items-center gap-1 rounded-lg border border-dashed border-brand-300 px-2.5 py-1 text-xs font-medium text-brand-600 dark:text-brand-200 hover:bg-brand-50 dark:hover:bg-brand-700/30 transition-colors disabled:opacity-40"
        >
          <Phone className="h-3 w-3" /> Llamar
        </button>
      </div>

      {replies.length > 3 && hasMediaHeader && (
        <fieldset className="mt-3 rounded-lg border border-border p-2.5">
          <legend className="px-1 text-xs font-medium text-foreground">Más de 3 opciones con archivo</legend>
          <p className="text-[11px] text-muted-foreground mb-2">
            WhatsApp no permite mostrar un archivo en el encabezado junto a una lista. ¿Cómo prefieres mostrarlas?
          </p>
          {(
            [
              ["paginate", "Paginar con «Más opciones»", "Un solo mensaje con el archivo y 2 opciones. «Más opciones» muestra las siguientes. Recomendado."],
              ["list", "Archivo aparte y lista", "Envía el archivo y justo después una lista desplegable con todas las opciones."],
            ] as const
          ).map(([value, title, desc]) => (
            <label
              key={value}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-2.5 py-2 mb-1.5 last:mb-0 cursor-pointer transition-colors",
                overflow === value ? "border-brand-300 bg-brand-50 dark:bg-brand-700/30 dark:border-brand-600" : "border-border hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="overflow"
                checked={overflow === value}
                onChange={() => set({ overflow: value })}
                className="mt-0.5 accent-brand-600"
              />
              <span>
                <span className="block text-xs font-medium text-foreground">{title}</span>
                <span className="block text-[11px] text-muted-foreground">{desc}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="mt-3 rounded-lg bg-muted/60 p-2.5 text-[11px] text-muted-foreground space-y-1">
        <p>
          <strong className="text-foreground">Respuesta:</strong> cada una tiene su propia salida en el flujo. Los botones de
          enlace y llamada no esperan respuesta: el flujo sigue por «Siguiente».
        </p>
        {hasUrl && (
          <p>
            <strong className="text-foreground">Enlace con seguimiento:</strong> su salida «al abrir» continúa el flujo la
            primera vez que el contacto lo abre. Solo se envía si la conversación está dentro de las 24 h de WhatsApp,
            Messenger o Instagram, y no si un agente la atiende. Las llamadas no se pueden rastrear.
          </p>
        )}
        <p>
          <strong className="text-foreground">WhatsApp:</strong> hasta 3 respuestas; de 4 a 10 se envían como lista.
          {replies.length > 0 && actions.length > 0 &&
            " No permite mezclar respuestas con botones de enlace: los enlaces y teléfonos se añaden al texto, donde son tocables."}
          {replies.length === 0 && hasUrl && " El primer enlace es un botón nativo; los demás van en el texto."}
          {hasCall && " No tiene botón de llamar en mensajes normales: el teléfono se muestra como texto tocable."}
        </p>
        <p>
          <strong className="text-foreground">Messenger:</strong> respuestas rápidas, y enlaces y llamadas como botones
          (hasta 3). <strong className="text-foreground">Instagram:</strong> enlaces y teléfonos en el texto.
        </p>
        <p>
          <strong className="text-foreground">Chat web y otros:</strong> opciones numeradas; el contacto responde con el
          número o el texto.
        </p>
      </div>
    </div>
  );
}

function ActionFields({
  data,
  set,
  labels,
  variableListId,
}: {
  data: FlowNodeData;
  set: (p: Partial<FlowNodeData>) => void;
  labels: LabelOption[];
  variableListId: string;
}) {
  const actions = data.actions || [];
  const update = (i: number, patch: Partial<FlowAction>) =>
    set({ actions: actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) });

  return (
    <div className="space-y-3">
      {actions.map((a, i) => (
        <div key={i} className="rounded-lg border border-border p-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <select
              aria-label={`Tipo de acción ${i + 1}`}
              value={a.type}
              onChange={(e) => update(i, { type: e.target.value as FlowActionType })}
              className={cn(inputClass, "py-1.5")}
            >
              {Object.entries(ACTION_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={`Eliminar acción ${i + 1}`}
              onClick={() => set({ actions: actions.filter((_, idx) => idx !== i) })}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-red-600 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {a.type === "set_variable" && (
            <div className="grid grid-cols-2 gap-1.5">
              <input
                aria-label="Variable"
                list={variableListId}
                value={a.variable || ""}
                onChange={(e) => update(i, { variable: e.target.value.replace(/[^\w]/g, "") })}
                placeholder="variable"
                className={cn(inputClass, "py-1.5 font-mono")}
              />
              <VariableInput
                aria-label="Valor"
                value={a.value || ""}
                onChange={(v) => update(i, { value: v })}
                placeholder="valor"
                className={cn(inputClass, "py-1.5")}
              />
            </div>
          )}

          {(a.type === "add_label" || a.type === "remove_label") && (
            <select
              aria-label="Etiqueta"
              value={a.labelId || ""}
              onChange={(e) => update(i, { labelId: e.target.value })}
              className={cn(inputClass, "py-1.5")}
            >
              <option value="">Selecciona una etiqueta…</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          )}

          {(a.type === "handoff" || a.type === "resolve") && (
            <p className="text-[11px] text-muted-foreground">
              {a.type === "handoff"
                ? "Pausa el bot para que la atienda un agente. Las palabras clave de los flujos siguen funcionando."
                : "Cierra la conversación."}{" "}
              El flujo termina después de esta acción.
            </p>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() => set({ actions: [...actions, { type: "set_variable", variable: "", value: "" }] })}
        className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-brand-300 text-xs font-medium text-brand-600 dark:text-brand-200 hover:bg-brand-50 dark:hover:bg-brand-700/30 transition-colors"
      >
        <Plus className="h-3 w-3" /> Agregar acción
      </button>
    </div>
  );
}
