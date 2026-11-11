import { useRef, useState } from "react";
import { FileText, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ACTION_LABELS,
  HEADER_ACCEPT,
  HEADER_TYPE_LABELS,
  flowsApi,
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
  onChange,
  onDelete,
  onClose,
}: NodeInspectorProps) {
  const set = (patch: Partial<FlowNodeData>) => onChange({ ...data, ...patch });
  const variableListId = `vars-${nodeId}`;

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

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {type === "start" && (
          <p className="text-xs text-muted-foreground">
            Punto de entrada del flujo. Conecta su salida con el primer paso. Los disparadores (palabras clave, conversación
            nueva) se configuran en el botón <strong>Disparadores</strong> de la barra superior.
          </p>
        )}

        {type === "message" && <MessageFields data={data} set={set} tenantId={tenantId} />}

        {type === "user_input" && (
          <>
            <div>
              <label className={labelClass} htmlFor={`${nodeId}-text`}>
                Pregunta
              </label>
              <textarea
                id={`${nodeId}-text`}
                rows={4}
                value={data.text || ""}
                onChange={(e) => set({ text: e.target.value })}
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
              <input
                id={`${nodeId}-err`}
                value={data.errorMessage || ""}
                onChange={(e) => set({ errorMessage: e.target.value })}
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
                list={variableListId}
                value={data.conditionVariable || ""}
                onChange={(e) => set({ conditionVariable: e.target.value.replace(/[^\w]/g, "") })}
                placeholder="last_button"
                className={cn(inputClass, "font-mono")}
              />
              <p className={hintClass}>
                <code className="font-mono">last_button</code> guarda el título del último botón pulsado.
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
                <input
                  id={`${nodeId}-cval`}
                  value={data.conditionValue || ""}
                  onChange={(e) => set({ conditionValue: e.target.value })}
                  className={inputClass}
                />
                <p className={hintClass}>No distingue mayúsculas ni tildes.</p>
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
      Usa <code className="font-mono">{"{{variable}}"}</code> o <code className="font-mono">{"{{contact_name}}"}</code> para
      personalizar.
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
      <input
        id={id}
        value={value}
        maxLength={MAX_HEADER_FOOTER}
        onChange={(e) => onChange(e.target.value)}
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
              ? "Con más de 3 botones WhatsApp usa lista, que no admite archivo en el encabezado: se enviará justo antes."
              : "En Messenger/Instagram se envía como adjunto antes del mensaje; en chat web como enlace."}
          </p>
        </div>
      )}
    </div>
  );
}

function MessageFields({
  data,
  set,
  tenantId,
}: {
  data: FlowNodeData;
  set: (p: Partial<FlowNodeData>) => void;
  tenantId?: string;
}) {
  const buttons = data.buttons || [];
  const titleLimit = buttons.length <= 3 ? WA_REPLY_BUTTON_TITLE : MAX_BUTTON_TITLE;

  const updateButton = (id: string, title: string) =>
    set({ buttons: buttons.map((b) => (b.id === id ? { ...b, title: title.slice(0, MAX_BUTTON_TITLE) } : b)) });

  return (
    <>
      <HeaderFields data={data} set={set} tenantId={tenantId} buttonCount={buttons.length} />
      <div>
        <label className={labelClass} htmlFor="msg-text">
          Texto
        </label>
        <textarea
          id="msg-text"
          rows={5}
          value={data.text || ""}
          onChange={(e) => set({ text: e.target.value })}
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

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className={labelClass}>
            Botones ({buttons.length}/{MAX_BUTTONS})
          </span>
          <button
            type="button"
            disabled={buttons.length >= MAX_BUTTONS}
            onClick={() => set({ buttons: [...buttons, { id: shortId("b"), title: "" }] })}
            className="flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-200 hover:underline disabled:opacity-40 disabled:no-underline"
          >
            <Plus className="h-3 w-3" /> Agregar
          </button>
        </div>
        {buttons.length === 0 ? (
          <p className={hintClass}>Sin botones, el flujo continúa directamente al siguiente paso.</p>
        ) : (
          <div className="space-y-2">
            {buttons.map((b, i) => {
              const over = b.title.length > titleLimit;
              return (
                <div key={b.id}>
                  <div className="flex items-center gap-1.5">
                    <input
                      aria-label={`Título del botón ${i + 1}`}
                      value={b.title}
                      onChange={(e) => updateButton(b.id, e.target.value)}
                      placeholder={`Opción ${i + 1}`}
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
                  <p className={cn("text-[10px] mt-0.5 text-right", over ? "text-amber-600" : "text-muted-foreground")}>
                    {b.title.length}/{titleLimit}
                    {over && " · se recortará en WhatsApp"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 rounded-lg bg-muted/60 p-2.5 text-[11px] text-muted-foreground space-y-1">
          <p>
            <strong className="text-foreground">WhatsApp:</strong> hasta 3 botones de respuesta; de 4 a 10 se envían como
            lista.
          </p>
          <p>
            <strong className="text-foreground">Messenger / Instagram:</strong> respuestas rápidas.
          </p>
          <p>
            <strong className="text-foreground">Chat web y otros:</strong> opciones numeradas; el contacto responde con el
            número o el texto.
          </p>
        </div>
      </div>
    </>
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
              <input
                aria-label="Valor"
                value={a.value || ""}
                onChange={(e) => update(i, { value: e.target.value })}
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
