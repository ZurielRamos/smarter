import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type IsValidConnection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { toast } from "sonner";
import {
  GitFork,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  Save,
  TextCursorInput,
  Trash2,
  Workflow,
  Zap,
} from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { migrateLegacyConditions, newBranch } from "./conditions";
import { EMPTY_TRIGGERS, FlowEditorContext, FlowVariablesContext } from "./editorContext";
import { buildVariableOptions, type VariableCatalog, type VariableMeta } from "./variables";
import { nodeTypes } from "./nodeTypes";
import { NodeInspector } from "./NodeInspector";
import { TriggersModal } from "./TriggersModal";
import {
  flowsApi,
  shortId,
  statusColors,
  statusLabels,
  type ConversationFlow,
  type ConversationFlowSummary,
  type FlowNodeData,
  type FlowNodeModel,
  type FlowNodeType,
  type FlowStatus,
  type FlowTriggers,
  type InboxOption,
  type LabelOption,
} from "./types";

type RFNode = Node<FlowNodeData>;

/** Contexto que expone la lista (Flujos.tsx) a la página de detalle. */
export interface FlujosOutletContext {
  flows: ConversationFlowSummary[];
  upsertFlow: (f: ConversationFlowSummary) => void;
  removeFlow: (id: string) => void;
}

const ADDABLE: { type: Exclude<FlowNodeType, "start">; label: string; icon: React.ReactNode; className: string }[] = [
  { type: "message", label: "Mensaje", icon: <MessageSquare className="h-3.5 w-3.5" />, className: "text-emerald-700 dark:text-emerald-300" },
  { type: "user_input", label: "Entrada", icon: <TextCursorInput className="h-3.5 w-3.5" />, className: "text-sky-700 dark:text-sky-300" },
  { type: "action", label: "Acción", icon: <Zap className="h-3.5 w-3.5" />, className: "text-purple-700 dark:text-purple-300" },
  { type: "condition", label: "Condición", icon: <GitFork className="h-3.5 w-3.5" />, className: "text-amber-600 dark:text-amber-300" },
  { type: "start_flow", label: "Iniciar flujo", icon: <Workflow className="h-3.5 w-3.5" />, className: "text-brand-700 dark:text-brand-200" },
];

function defaultData(type: FlowNodeType): FlowNodeData {
  switch (type) {
    case "message":
      return { text: "", buttons: [] };
    case "user_input":
      return { text: "", variable: "", validation: "any" };
    case "action":
      return { actions: [] };
    case "condition":
      return { branches: [newBranch(1)] };
    default:
      return {};
  }
}

/** Tipo con el que la condición trata la respuesta guardada por un nodo Entrada. */
function inputVariableMeta(data: FlowNodeData): VariableMeta {
  switch (data.validation) {
    case "number":
      return { type: "number" };
    case "date":
      return { type: "date" };
    case "yes_no":
      return { type: "select", options: ["sí", "no"] };
    case "choice": {
      const options = (data.choices || []).map((c) => c.trim()).filter(Boolean);
      return options.length ? { type: "select", options } : { type: "text" };
    }
    default:
      return { type: "text" };
  }
}

function toRFNodes(nodes: FlowNodeModel[]): RFNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data || {},
    deletable: n.type !== "start",
  }));
}

function toRFEdges(edges: ConversationFlow["edges"]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || "next",
  }));
}

/** Salidas válidas de un nodo según sus datos actuales. */
function validHandles(node: RFNode): Set<string> {
  switch (node.type) {
    case "message": {
      // Respuestas: `btn:`. Enlaces rastreados: «Al hacer clic» (`click:`). Las llamadas no ramifican.
      const buttons = node.data.buttons || [];
      const replies = buttons.filter((b) => (b.type ?? "reply") === "reply");
      const clicks = buttons.filter((b) => b.type === "url" && b.track !== false).map((b) => `click:${b.id}`);
      return new Set([...(replies.length ? replies.map((b) => `btn:${b.id}`) : ["next"]), ...clicks]);
    }
    case "user_input":
      // «Sin respuesta válida» se usa al agotarse los intentos.
      return new Set(["next", "invalid"]);
    case "condition": {
      const branches = node.data.branches;
      // Nodo antiguo sin ramas: conserva sus salidas Sí / No.
      if (!branches) return new Set(["true", "false"]);
      return new Set([...branches.map((b) => `cond:${b.id}`), "else"]);
    }
    case "start_flow":
      return new Set();
    case "action":
      return (node.data.actions || []).some((a) => a.type === "handoff" || a.type === "resolve")
        ? new Set()
        : new Set(["next"]);
    default:
      return new Set(["next"]);
  }
}

function useIsDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export function FlujoEditor() {
  return (
    <ReactFlowProvider>
      <FlujoEditorInner />
    </ReactFlowProvider>
  );
}

function FlujoEditorInner() {
  const { slug, flowId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantId = user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenantId;
  const { flows, upsertFlow, removeFlow } = useOutletContext<FlujosOutletContext>();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const isDark = useIsDark();
  const canvasRef = useRef<HTMLDivElement>(null);

  const [flow, setFlow] = useState<ConversationFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [name, setName] = useState("");
  const [triggers, setTriggers] = useState<FlowTriggers>(EMPTY_TRIGGERS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labels, setLabels] = useState<LabelOption[]>([]);
  const [inboxes, setInboxes] = useState<InboxOption[]>([]);
  const [linkTracking, setLinkTracking] = useState<boolean | null>(null);
  const [showTriggers, setShowTriggers] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showActivateWarning, setShowActivateWarning] = useState(false);

  // ─── Carga ───
  useEffect(() => {
    if (!tenantId || !flowId) return;
    let cancelled = false;
    setLoading(true);
    setSelectedId(null);
    flowsApi
      .get<ConversationFlow>(`/conversation-flows/${flowId}`, { params: { tenantId } })
      .then(({ data }) => {
        if (cancelled) return;
        setFlow(data);
        setName(data.name);
        setTriggers(data.triggers || EMPTY_TRIGGERS);
        // Los nodos Condición antiguos (Sí / No) se convierten al formato de ramas.
        const migrated = migrateLegacyConditions(data.nodes, data.edges);
        setNodes(toRFNodes(migrated.nodes));
        setEdges(toRFEdges(migrated.edges));
        setDirty(false);
        requestAnimationFrame(() => fitView({ padding: 0.3, maxZoom: 1 }));
      })
      .catch(() => {
        if (!cancelled) toast.error("No se pudo cargar el flujo");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tenantId, flowId, setNodes, setEdges, fitView]);

  useEffect(() => {
    if (!tenantId) return;
    flowsApi
      .get<LabelOption[]>("/chats/labels", { params: { tenantId } })
      .then(({ data }) => setLabels(data))
      .catch(() => {});
    flowsApi
      .get<InboxOption[]>("/chats/inboxes", { params: { tenantId } })
      .then(({ data }) => setInboxes(data))
      .catch(() => {});
  }, [tenantId]);

  // ¿El servidor puede generar enlaces cortos públicos para rastrear clics?
  useEffect(() => {
    flowsApi
      .get<{ linkTracking: boolean }>("/conversation-flows/capabilities")
      .then(({ data }) => setLinkTracking(data.linkTracking))
      .catch(() => {});
  }, []);

  // Avisar antes de cerrar la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // ─── Edición del grafo ───
  const markDirty = useCallback(() => setDirty(true), []);

  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      if (changes.some((c) => c.type !== "select" && c.type !== "dimensions")) markDirty();
      const removed = changes.filter((c) => c.type === "remove").map((c) => c.id);
      if (removed.length) setSelectedId((cur) => (cur && removed.includes(cur) ? null : cur));
    },
    [onNodesChange, markDirty],
  );

  const handleEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes);
      if (changes.some((c) => c.type !== "select")) markDirty();
    },
    [onEdgesChange, markDirty],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      const handle = conn.sourceHandle || "next";
      setEdges((eds) =>
        addEdge(
          { ...conn, sourceHandle: handle, id: `e_${conn.source}_${handle}_${conn.target}` },
          // Cada salida conecta con un único destino: reemplaza la conexión anterior.
          eds.filter((e) => !(e.source === conn.source && (e.sourceHandle || "next") === handle)),
        ),
      );
      markDirty();
    },
    [setEdges, markDirty],
  );

  const isValidConnection: IsValidConnection = useCallback(
    (conn) => {
      if (conn.source === conn.target) return false;
      const target = nodes.find((n) => n.id === conn.target);
      return !!target && target.type !== "start";
    },
    [nodes],
  );

  const addNode = (type: Exclude<FlowNodeType, "start">) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = rect
      ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      : { x: 0, y: 0 };
    const offset = (nodes.length % 5) * 24;
    const id = shortId("n");
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      { id, type, position: { x: center.x - 128 + offset, y: center.y - 60 + offset }, data: defaultData(type), selected: true },
    ]);
    setSelectedId(id);
    markDirty();
  };

  const selectedNode = nodes.find((n) => n.id === selectedId) || null;

  const updateNodeData = (id: string, data: FlowNodeData) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data } : n)));
    // Quitar conexiones de salidas que ya no existen (botón borrado, acción terminal…).
    const node = nodes.find((n) => n.id === id);
    if (node) {
      const valid = validHandles({ ...node, data });
      setEdges((eds) => eds.filter((e) => e.source !== id || valid.has(e.sourceHandle || "next")));
    }
    markDirty();
  };

  const deleteNode = (id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSelectedId(null);
    markDirty();
  };

  /** Variables conocidas del flujo, para autocompletar. */
  const variables = useMemo(() => {
    const set = new Set<string>(["last_button"]);
    for (const n of nodes) {
      if (n.data.variable) set.add(n.data.variable);
      for (const e of n.data.ai?.extras || []) if (e.variable) set.add(e.variable);
      for (const a of n.data.actions || []) if (a.type === "set_variable" && a.variable) set.add(a.variable);
    }
    return [...set].sort();
  }, [nodes]);

  // Catálogo para el dropdown de `{`: campos del CRM, personalizados del tenant y especiales.
  const [variableCatalog, setVariableCatalog] = useState<VariableCatalog | null>(null);
  useEffect(() => {
    if (!tenantId) return;
    flowsApi
      .get<VariableCatalog>("/conversation-flows/variables", { params: { tenantId } })
      .then(({ data }) => setVariableCatalog(data))
      .catch(() => {
        // Sin catálogo el dropdown sigue ofreciendo las variables del flujo y las especiales.
      });
  }, [tenantId]);
  // Tipo y valores de las variables propias del flujo, para que la condición ofrezca
  // los operadores y valores adecuados (p. ej. «Último botón» → los botones del flujo).
  const variableMeta = useMemo(() => {
    const meta: Record<string, VariableMeta> = { contact_name: { type: "text" } };
    const replies = new Set<string>();
    const links = new Set<string>();
    for (const n of nodes) {
      for (const b of n.data.buttons || []) {
        const title = b.title?.trim();
        if (!title) continue;
        if ((b.type ?? "reply") === "reply") replies.add(title);
        else if (b.type === "url" && b.track !== false) links.add(title);
      }
      if (n.type === "user_input") {
        if (n.data.variable) meta[n.data.variable] = inputVariableMeta(n.data);
        for (const e of n.data.ai?.extras || []) if (e.variable && !meta[e.variable]) meta[e.variable] = { type: "text" };
      }
    }
    for (const n of nodes) {
      for (const a of n.data.actions || []) {
        if (a.type === "set_variable" && a.variable && !meta[a.variable]) meta[a.variable] = { type: "text" };
      }
    }
    meta.last_button = replies.size ? { type: "select", options: [...replies] } : { type: "text" };
    meta.last_link = links.size ? { type: "select", options: [...links] } : { type: "text" };
    return meta;
  }, [nodes]);
  const variableOptions = useMemo(
    () => buildVariableOptions(variables, variableCatalog, variableMeta),
    [variables, variableCatalog, variableMeta],
  );

  // ─── Guardado ───
  const save = useCallback(
    async (extra?: { status?: FlowStatus; triggers?: FlowTriggers }): Promise<boolean> => {
      if (!tenantId || !flowId) return false;
      const trimmed = name.trim();
      if (!trimmed) {
        toast.error("El flujo necesita un nombre");
        return false;
      }
      setSaving(true);
      try {
        const { data } = await flowsApi.put<ConversationFlow>(`/conversation-flows/${flowId}`, {
          tenantId,
          name: trimmed,
          nodes: nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
          edges: edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle || "next", target: e.target })),
          triggers: extra?.triggers ?? triggers,
          ...(extra?.status ? { status: extra.status } : {}),
        });
        setFlow(data);
        setTriggers(data.triggers || EMPTY_TRIGGERS);
        // El backend sanea las conexiones: reflejar el resultado.
        setEdges(toRFEdges(data.edges));
        setDirty(false);
        upsertFlow(data);
        return true;
      } catch (err: any) {
        const msg = err?.response?.data?.message;
        toast.error(Array.isArray(msg) ? msg.join(", ") : msg || "Error al guardar el flujo");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [tenantId, flowId, name, nodes, edges, triggers, setEdges, upsertFlow],
  );

  const handleSave = async () => {
    if (await save()) toast.success("Flujo guardado");
  };

  // Ctrl/Cmd + S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saving) handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const hasTriggers = triggers.keywords.length > 0 || triggers.onNewConversation;

  const activate = async () => {
    setShowActivateWarning(false);
    if (await save({ status: "active" })) toast.success("Flujo activado");
  };

  const toggleStatus = async () => {
    if (flow?.status === "active") {
      if (await save({ status: "inactive" })) toast.success("Flujo desactivado");
      return;
    }
    const startNode = nodes.find((n) => n.type === "start");
    if (!edges.some((e) => e.source === startNode?.id)) {
      toast.error("Conecta el nodo Inicio con el primer paso antes de activar");
      return;
    }
    if (!hasTriggers) {
      setShowActivateWarning(true);
      return;
    }
    await activate();
  };

  const applyTriggers = async (t: FlowTriggers) => {
    setShowTriggers(false);
    setTriggers(t);
    if (await save({ triggers: t })) toast.success("Disparadores guardados");
  };

  const handleDelete = async () => {
    if (!tenantId || !flowId) return;
    try {
      await flowsApi.delete(`/conversation-flows/${flowId}`, { params: { tenantId } });
      removeFlow(flowId);
      setShowDelete(false);
      setDirty(false);
      toast.success("Flujo eliminado");
      navigate(`/${slug}/comunicaciones/flujos`);
    } catch {
      toast.error("Error al eliminar el flujo");
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando flujo" />
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Flujo no encontrado</p>
      </div>
    );
  }

  const status = flow.status;

  return (
    <FlowEditorContext.Provider value={{ flows, labels, inboxes, currentFlowId: flow.id }}>
     <FlowVariablesContext.Provider value={variableOptions}>
      <div className="flex-1 min-w-0 flex flex-col bg-background">
        {/* Header */}
        <div className="bg-card border-b border-border px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <div className="h-8 w-8 rounded-lg bg-brand-50 dark:bg-brand-700/40 flex items-center justify-center shrink-0">
            <Workflow className="h-4 w-4 text-brand-600 dark:text-brand-200" />
          </div>
          <input
            aria-label="Nombre del flujo"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              markDirty();
            }}
            className="min-w-0 flex-1 max-w-sm bg-transparent text-base font-semibold text-foreground rounded-md px-1.5 py-0.5 hover:bg-muted focus:bg-background focus:outline-none focus:ring-1 focus:ring-brand-200"
          />
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", statusColors[status])}>
            {statusLabels[status]}
          </span>
          {dirty && <span className="text-[11px] text-amber-600 dark:text-amber-400">Cambios sin guardar</span>}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTriggers(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Zap className="h-3.5 w-3.5" />
              Disparadores
              {hasTriggers && <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-label="configurados" />}
            </button>
            <button
              type="button"
              onClick={toggleStatus}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {status === "active" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {status === "active" ? "Desactivar" : "Activar"}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setShowDelete(true)}
              aria-label="Eliminar flujo"
              title="Eliminar flujo"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Canvas + inspector */}
        <div className="flex-1 min-h-0 flex">
          <div ref={canvasRef} className="relative flex-1 min-w-0">
            {/* Paleta de nodos */}
            <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded-xl border border-border bg-card p-1.5 shadow-sm">
              <span className="px-2 pt-0.5 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">Agregar</span>
              {ADDABLE.map((a) => (
                <button
                  key={a.type}
                  type="button"
                  onClick={() => addNode(a.type)}
                  className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors", a.className)}
                >
                  {a.icon}
                  {a.label}
                </button>
              ))}
            </div>

            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onNodeClick={(_, n) => setSelectedId(n.id)}
              onPaneClick={() => setSelectedId(null)}
              colorMode={isDark ? "dark" : "light"}
              defaultEdgeOptions={{ type: "smoothstep", style: { strokeWidth: 2 } }}
              deleteKeyCode={["Backspace", "Delete"]}
              minZoom={0.2}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} size={1} />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable className="!bg-card !border !border-border rounded-lg" />
            </ReactFlow>
          </div>

          {selectedNode && (
            <NodeInspector
              key={selectedNode.id}
              nodeId={selectedNode.id}
              type={selectedNode.type as FlowNodeType}
              data={selectedNode.data}
              flows={flows}
              currentFlowId={flow.id}
              labels={labels}
              inboxes={inboxes}
              variables={variables}
              variableOptions={variableOptions}
              tenantId={tenantId}
              linkTracking={linkTracking}
              onChange={(d) => updateNodeData(selectedNode.id, d)}
              onDelete={() => deleteNode(selectedNode.id)}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      </div>

      <TriggersModal
        open={showTriggers}
        triggers={triggers}
        inboxes={inboxes}
        onClose={() => setShowTriggers(false)}
        onSave={applyTriggers}
      />

      <ConfirmModal
        open={showActivateWarning}
        onClose={() => setShowActivateWarning(false)}
        onConfirm={activate}
        title="Activar sin disparadores"
        description="Este flujo no tiene palabras clave ni inicio automático. Solo se ejecutará cuando otro flujo lo inicie. ¿Activarlo igualmente?"
        confirmLabel="Activar"
        variant="warning"
      />

      <ConfirmModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Eliminar flujo"
        description={`Se eliminará "${flow.name}" permanentemente. Las conversaciones que estén dentro de este flujo saldrán de él y los nodos "Iniciar flujo" que apunten a él dejarán de funcionar. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
      />
     </FlowVariablesContext.Provider>
    </FlowEditorContext.Provider>
  );
}
