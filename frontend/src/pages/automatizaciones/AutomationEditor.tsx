import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, History, Loader2, Play, Power, PowerOff, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  apiErrorMessage,
  automationsApi,
  statusColors,
  statusLabels,
  type Automation,
  type AutomationConnection,
  type AutomationNode,
  type AutomationNodeData,
  type AutomationNodeType,
  type AutomationRun,
  type GraphIssue,
  type InboxOption,
} from "@/services/automatizaciones";
import { AutoNode } from "./AutoNode";
import { NodeInspector } from "./NodeInspector";
import { RunPanel } from "./RunPanel";
import { CATEGORY_LABELS, NODE_BY_TYPE, NODE_CATALOG, type NodeCategory } from "./nodeCatalog";
import { EditorContext, type NodeRunInfo } from "./editorContext";

type FlowNode = Node<AutomationNodeData>;

const nodeTypes = Object.fromEntries(NODE_CATALOG.map((n) => [n.type, AutoNode]));

const edgeDefaults = {
  type: "smoothstep" as const,
  markerEnd: { type: MarkerType.ArrowClosed },
};

const toFlowNodes = (nodes: AutomationNode[]): FlowNode[] =>
  nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data }));

const toFlowEdges = (a: Automation): Edge[] =>
  a.edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle ?? undefined,
    target: e.target,
    ...edgeDefaults,
  }));

const newId = (type: string) => `${type.replace("trigger_", "t-")}-${Math.random().toString(36).slice(2, 7)}`;

export function AutomationEditor() {
  return (
    <ReactFlowProvider>
      <EditorInner />
    </ReactFlowProvider>
  );
}

function EditorInner() {
  const navigate = useNavigate();
  const { slug, automationId } = useParams();
  const { user } = useAuth();
  const tenantId = user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenantId;
  const { screenToFlowPosition, fitView } = useReactFlow();

  const [auto, setAuto] = useState<Automation | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("America/Mexico_City");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [connections, setConnections] = useState<AutomationConnection[]>([]);
  const [inboxes, setInboxes] = useState<InboxOption[]>([]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<AutomationRun | null>(null);
  const [history, setHistory] = useState<AutomationRun[]>([]);
  const [testInput, setTestInput] = useState("");
  const [issues, setIssues] = useState<GraphIssue[]>([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const reloadConnections = useCallback(() => {
    if (tenantId) automationsApi.connections(tenantId).then(setConnections).catch(() => undefined);
  }, [tenantId]);

  // ── Carga inicial ──
  useEffect(() => {
    if (!tenantId || !automationId) return;
    setLoading(true);
    Promise.all([automationsApi.get(automationId, tenantId), automationsApi.connections(tenantId), automationsApi.runs(automationId, tenantId), automationsApi.inboxes(tenantId).catch(() => [] as InboxOption[])])
      .then(([a, conns, runs, boxes]) => {
        setInboxes(boxes);
        setAuto(a);
        setName(a.name);
        setTimezone(a.settings?.timezone || "America/Mexico_City");
        setNodes(toFlowNodes(a.nodes));
        setEdges(toFlowEdges(a));
        setConnections(conns);
        setHistory(runs);
        setDirty(false);
        setTimeout(() => fitView({ padding: 0.3, maxZoom: 1 }), 50);
      })
      .catch(() => {
        toast.error("No se pudo cargar la automatización");
        navigate(`/${slug}/automatizaciones`);
      })
      .finally(() => setLoading(false));
  }, [tenantId, automationId, slug, navigate, setNodes, setEdges, fitView]);

  // ── Aviso al salir con cambios sin guardar ──
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // ── Cambios del canvas (ignora selección y medidas para el "dirty") ──
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      onNodesChangeBase(changes);
      if (changes.some((c) => c.type !== "select" && c.type !== "dimensions")) setDirty(true);
    },
    [onNodesChangeBase],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChangeBase(changes);
      if (changes.some((c) => c.type !== "select")) setDirty(true);
    },
    [onEdgesChangeBase],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source === c.target) return;
      setEdges((eds) => {
        const dup = eds.some((e) => e.source === c.source && e.target === c.target && e.sourceHandle === c.sourceHandle);
        return dup ? eds : addEdge({ ...c, ...edgeDefaults }, eds);
      });
      setDirty(true);
    },
    [setEdges],
  );

  // ── Alta de nodos ──
  const addNode = useCallback(
    (type: AutomationNodeType, position?: { x: number; y: number }) => {
      const def = NODE_BY_TYPE[type];
      if (!def) return;
      const pos =
        position ??
        (() => {
          const rect = wrapperRef.current?.getBoundingClientRect();
          return screenToFlowPosition({
            x: (rect?.left ?? 0) + (rect?.width ?? 600) / 2 - 120,
            y: (rect?.top ?? 0) + (rect?.height ?? 400) / 2 - 40,
          });
        })();

      // Solo un disparador: el nuevo reemplaza al existente conservando sus conexiones.
      if (def.category === "trigger") {
        setNodes((nds) => {
          const existing = nds.find((n) => n.type?.startsWith("trigger_"));
          if (!existing) return [...nds, { id: newId(type), type, position: pos, data: { ...def.defaults } }];
          return nds.map((n) => (n.id === existing.id ? { ...n, type, data: { ...def.defaults } } : n));
        });
        setDirty(true);
        return;
      }

      const id = newId(type);
      setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), { id, type, position: pos, data: { ...def.defaults }, selected: true }]);
      setSelectedId(id);
      setDirty(true);
    },
    [screenToFlowPosition, setNodes],
  );

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/automation-node") as AutomationNodeType;
    if (!type) return;
    addNode(type, screenToFlowPosition({ x: e.clientX - 120, y: e.clientY - 30 }));
  };

  const updateNodeData = useCallback(
    (id: string, data: AutomationNodeData) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data } : n)));
      // Si se quitó una rama de condición, se eliminan sus conexiones huérfanas.
      const branchIds = new Set(
        Array.isArray(data.branches) ? (data.branches as { id: string }[]).map((b) => `cond:${b.id}`) : [],
      );
      setEdges((eds) =>
        eds.filter((e) => {
          if (e.source !== id || !e.sourceHandle) return true;
          if (e.sourceHandle.startsWith("cond:")) return branchIds.has(e.sourceHandle);
          if (e.sourceHandle === "error") return data.onError === "continue";
          return true;
        }),
      );
      setDirty(true);
    },
    [setNodes, setEdges],
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId(null);
      setDirty(true);
    },
    [setNodes, setEdges],
  );

  // ── Guardado ──
  const serialize = useCallback(
    () => ({
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as AutomationNodeType,
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
        data: n.data,
      })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle ?? null, target: e.target })),
    }),
    [nodes, edges],
  );

  const save = useCallback(
    async (status?: Automation["status"]): Promise<boolean> => {
      if (!auto || !tenantId) return false;
      setSaving(true);
      try {
        const updated = await automationsApi.update(auto.id, tenantId, {
          name: name.trim() || auto.name,
          ...serialize(),
          settings: { ...(auto.settings ?? {}), timezone },
          ...(status ? { status } : {}),
        });
        setAuto((prev) => (prev ? { ...prev, ...updated } : updated));
        setDirty(false);
        setIssues([]);
        return true;
      } catch (err) {
        const data = (err as { response?: { data?: { issues?: GraphIssue[] } } })?.response?.data;
        if (data?.issues?.length) {
          setIssues(data.issues);
          toast.error("No se puede activar", { description: data.issues.map((i) => i.message).join("\n") });
        } else if (!(err as { response?: unknown }).response) {
          toast.error("No se pudo guardar", { description: apiErrorMessage(err, "Error de red") });
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [auto, tenantId, name, timezone, serialize],
  );

  // Ctrl/Cmd+S
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) void save().then((ok) => ok && toast.success("Guardado"));
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [dirty, saving, save]);

  const toggleActive = async () => {
    if (!auto) return;
    if (auto.status === "active") {
      setConfirmDeactivate(true);
      return;
    }
    if (await save("active")) toast.success("Automatización activada");
  };

  // ── Ejecución de prueba ──
  const runInfo = useMemo(() => {
    const info: Record<string, NodeRunInfo> = {};
    for (const s of run?.steps ?? []) info[s.nodeId] = { status: s.status, durationMs: s.durationMs };
    return info;
  }, [run]);

  const refreshHistory = useCallback(() => {
    if (auto && tenantId) automationsApi.runs(auto.id, tenantId).then(setHistory).catch(() => undefined);
  }, [auto, tenantId]);

  const handleRun = async () => {
    if (!auto || !tenantId) return;
    let input: Record<string, unknown> | undefined;
    if (testInput.trim()) {
      try {
        const parsed = JSON.parse(testInput);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
        input = parsed;
      } catch {
        setPanelOpen(true);
        toast.error("Los datos de prueba deben ser un objeto JSON válido");
        return;
      }
    }
    if (dirty && !(await save())) return;
    setPanelOpen(true);
    setRunning(true);
    setRun(null);
    try {
      const result = await automationsApi.run(auto.id, tenantId, input);
      setRun(result);
      if (result.status === "success") toast.success("Ejecución completada");
      else toast.error("La ejecución terminó con error", { description: result.error ?? undefined });
      refreshHistory();
    } catch {
      /* el interceptor ya muestra el error */
    } finally {
      setRunning(false);
    }
  };

  const openRun = async (id: string) => {
    if (!tenantId) return;
    try {
      setRun(await automationsApi.getRun(id, tenantId));
    } catch {
      toast.error("No se pudo cargar la ejecución");
    }
  };

  const rotateWebhook = async () => {
    if (!auto || !tenantId) return;
    const updated = await automationsApi.rotateWebhook(auto.id, tenantId);
    setAuto((prev) => (prev ? { ...prev, webhookToken: updated.webhookToken } : prev));
    toast.success("URL regenerada");
  };

  const selected = nodes.find((n) => n.id === selectedId);
  const issueNodeIds = useMemo(() => new Set(issues.map((i) => i.nodeId).filter(Boolean) as string[]), [issues]);
  const ctxValue = useMemo(
    () => ({
      tenantId: tenantId ?? "",
      automationId: auto?.id ?? "",
      webhookToken: auto?.webhookToken ?? "",
      runInfo,
      issueNodeIds,
      connections,
      inboxes,
      reloadConnections,
      nodes: nodes.map((n) => ({ id: n.id, type: n.type as AutomationNodeType, position: n.position, data: n.data })),
      onRotateWebhook: rotateWebhook,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenantId, auto?.id, auto?.webhookToken, runInfo, issueNodeIds, connections, inboxes, reloadConnections, nodes],
  );

  const palette = useMemo(() => {
    const q = paletteSearch.toLowerCase();
    return (Object.keys(CATEGORY_LABELS) as NodeCategory[])
      .map((cat) => ({
        cat,
        items: NODE_CATALOG.filter((n) => n.category === cat && (n.label.toLowerCase().includes(q) || n.description.toLowerCase().includes(q))),
      }))
      .filter((g) => g.items.length);
  }, [paletteSearch]);

  if (loading || !auto) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando" />
      </div>
    );
  }

  const isActive = auto.status === "active";
  const goBack = () => (dirty ? setConfirmLeave(true) : navigate(`/${slug}/automatizaciones`));

  return (
    <EditorContext.Provider value={ctxValue}>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Barra superior */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <button type="button" onClick={goBack} aria-label="Volver" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <input
            aria-label="Nombre de la automatización"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            maxLength={255}
            className="min-w-0 max-w-sm flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-foreground hover:border-border focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-200"
          />
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", statusColors[auto.status])}>{statusLabels[auto.status]}</span>
          {dirty && <span className="text-[10px] text-amber-600">Sin guardar</span>}

          <div className="ml-auto flex items-center gap-1.5">
            <select
              aria-label="Zona horaria"
              value={timezone}
              onChange={(e) => {
                setTimezone(e.target.value);
                setDirty(true);
              }}
              className="hidden rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground md:block"
            >
              {["America/Mexico_City", "America/Bogota", "America/Lima", "America/Santiago", "America/Argentina/Buenos_Aires", "America/New_York", "America/Los_Angeles", "Europe/Madrid", "UTC"].map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className={cn("flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted", panelOpen ? "bg-muted text-foreground" : "text-muted-foreground")}
            >
              <History className="h-3.5 w-3.5" /> Ejecuciones
            </button>
            <button
              type="button"
              onClick={handleRun}
              disabled={running || saving}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Probar
            </button>
            <button
              type="button"
              onClick={() => void save().then((ok) => ok && toast.success("Guardado"))}
              disabled={!dirty || saving}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
            </button>
            <button
              type="button"
              onClick={toggleActive}
              disabled={saving}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50",
                isActive ? "bg-amber-600 hover:bg-amber-500" : "bg-brand-700 hover:bg-brand-600",
              )}
            >
              {isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />} {isActive ? "Desactivar" : "Activar"}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Paleta */}
          <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card" aria-label="Paleta de nodos">
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  aria-label="Buscar nodo"
                  placeholder="Buscar nodo…"
                  value={paletteSearch}
                  onChange={(e) => setPaletteSearch(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-2">
              {palette.map((g) => (
                <div key={g.cat}>
                  <p className="px-1 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">{CATEGORY_LABELS[g.cat]}</p>
                  <div className="space-y-1">
                    {g.items.map((n) => {
                      const Icon = n.icon;
                      return (
                        <button
                          key={n.type}
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("application/automation-node", n.type);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={() => addNode(n.type)}
                          title={n.description}
                          className="flex w-full cursor-grab items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-left transition-colors hover:border-brand-300 hover:bg-muted active:cursor-grabbing"
                        >
                          <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white", n.accent)}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="truncate text-xs font-medium text-foreground">{n.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {palette.length === 0 && <p className="p-2 text-center text-xs text-muted-foreground">Sin resultados</p>}
            </div>
            <p className="border-t border-border p-2 text-[10px] text-muted-foreground">Arrastra al lienzo o haz clic para agregar.</p>
          </aside>

          {/* Canvas */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div ref={wrapperRef} className="min-h-0 flex-1" onDrop={onDrop} onDragOver={onDragOver}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, n) => setSelectedId(n.id)}
                onPaneClick={() => setSelectedId(null)}
                defaultEdgeOptions={edgeDefaults}
                deleteKeyCode={["Backspace", "Delete"]}
                onBeforeDelete={async ({ nodes: del, edges: delEdges }) => {
                  // El disparador no se puede borrar.
                  const safe = del.filter((n) => !n.type?.startsWith("trigger_"));
                  return { nodes: safe, edges: delEdges };
                }}
                snapToGrid
                snapGrid={[16, 16]}
                minZoom={0.2}
                maxZoom={1.5}
                fitView
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable className="!bg-card !border !border-border rounded-lg" />
              </ReactFlow>
            </div>
            {panelOpen && (
              <RunPanel
                run={run}
                history={history}
                running={running}
                testInput={testInput}
                onTestInput={setTestInput}
                onOpenRun={openRun}
                onSelectNode={setSelectedId}
                onClose={() => setPanelOpen(false)}
              />
            )}
          </div>

          {selected && (
            <NodeInspector
              key={selected.id}
              node={{ id: selected.id, type: selected.type as AutomationNodeType, position: selected.position, data: selected.data }}
              onChange={updateNodeData}
              onDelete={deleteNode}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={() => navigate(`/${slug}/automatizaciones`)}
        title="Salir sin guardar"
        description="Tienes cambios sin guardar que se perderán."
        confirmLabel="Salir sin guardar"
        variant="warning"
      />
      <ConfirmModal
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        onConfirm={async () => {
          if (await save("inactive")) toast.success("Automatización desactivada");
          setConfirmDeactivate(false);
        }}
        title="Desactivar automatización"
        description="Dejará de responder a su webhook y a su programación hasta que la actives de nuevo."
        confirmLabel="Desactivar"
        variant="warning"
      />
    </EditorContext.Provider>
  );
}
