import { useState, useCallback } from "react";
import { DndContext, pointerWithin, PointerSensor, useSensor, useSensors, DragOverlay } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { EmailRow, BlockType } from "./types";
import { createRow, createBlock } from "./types";
import { exportToHtml } from "./export-html";
import { BuilderToolbar } from "./BuilderToolbar";
import { BuilderSidebar, BLOCK_ICONS } from "./BuilderSidebar";
import { BuilderCanvas } from "./BuilderCanvas";
import { BuilderPropertiesPanel } from "./BuilderPropertiesPanel";
import { TestEmailModal } from "./TestEmailModal";

interface EmailBuilderProps {
  initialBlocks?: EmailRow[];
  onSave: (data: { blocks: EmailRow[]; html: string }) => void;
  saving?: boolean;
  templateName: string;
  templateSubject: string;
  onNameChange: (v: string) => void;
  onSubjectChange: (v: string) => void;
  onClose: () => void;
  languageSlot?: React.ReactNode;
}

export function EmailBuilder({ initialBlocks, onSave, saving = false, templateName, templateSubject, onNameChange, onSubjectChange, onClose, languageSlot }: EmailBuilderProps) {
  const defaultRows: EmailRow[] = initialBlocks && initialBlocks.length > 0 ? initialBlocks : [
    createRow([1, 1]),
    createRow([1]),
    createRow([1, 1]),
  ];
  const [rows, setRows] = useState<EmailRow[]>(defaultRows);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [showLayouts, setShowLayouts] = useState(false);
  const [activeDragType, setActiveDragType] = useState<BlockType | null>(null);
  const [overCellId, setOverCellId] = useState<string | null>(null);
  const [canvasStyle, setCanvasStyle] = useState({ paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, width: 600, backgroundColor: "#ffffff", backgroundImage: "" });
  const [showTestModal, setShowTestModal] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Find selected block
  const selectedBlock = (() => {
    for (const row of rows) {
      for (const cell of row.cells) {
        const found = cell.blocks.find((b) => b.id === selectedBlockId);
        if (found) return found;
      }
    }
    return null;
  })();

  const addRow = useCallback((widths: number[]) => {
    const row = createRow(widths);
    setRows((prev) => [...prev, row]);
    setSelectedRowId(row.id);
    setSelectedBlockId(null);
    setShowLayouts(false);
  }, []);

  const deleteRow = useCallback((rowId: string) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
    if (selectedRowId === rowId) { setSelectedRowId(null); setSelectedBlockId(null); }
  }, [selectedRowId]);

  const addBlockToCell = useCallback((rowId: string, cellId: string, type: BlockType) => {
    const block = createBlock(type);
    setRows((prev) => prev.map((row) => {
      if (row.id !== rowId) return row;
      return { ...row, cells: row.cells.map((cell) => cell.id !== cellId ? cell : { ...cell, blocks: [...cell.blocks, block] }) };
    }));
    setSelectedBlockId(block.id);
    setSelectedRowId(rowId);
  }, []);

  const deleteBlock = useCallback((blockId: string) => {
    setRows((prev) => prev.map((row) => ({
      ...row, cells: row.cells.map((cell) => ({ ...cell, blocks: cell.blocks.filter((b) => b.id !== blockId) })),
    })));
    if (selectedBlockId === blockId) setSelectedBlockId(null);
  }, [selectedBlockId]);

  const updateBlockProps = useCallback((blockId: string, props: Record<string, any>) => {
    setRows((prev) => prev.map((row) => ({
      ...row, cells: row.cells.map((cell) => ({ ...cell, blocks: cell.blocks.map((b) => b.id === blockId ? { ...b, props } : b) })),
    })));
  }, []);

  const updateRowStyle = useCallback((rowId: string, style: EmailRow["style"]) => {
    setRows((prev) => prev.map((row) => row.id === rowId ? { ...row, style } : row));
  }, []);

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.fromSidebar) setActiveDragType(data.type as BlockType);
  };

  const handleDragOver = (event: any) => {
    const cellId = event.over?.data?.current?.cellId;
    setOverCellId(cellId || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragType(null);
    setOverCellId(null);
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    // Drop from sidebar to cell
    if (activeData?.fromSidebar && overData?.cellId && overData?.rowId) {
      addBlockToCell(overData.rowId, overData.cellId, activeData.type as BlockType);
      return;
    }

    // Row reorder
    if (active.id !== over.id && !activeData?.fromSidebar) {
      setRows((prev) => {
        const oldIdx = prev.findIndex((r) => r.id === active.id);
        const newIdx = prev.findIndex((r) => r.id === over.id);
        if (oldIdx === -1 || newIdx === -1) return prev;
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  };

  const handleSave = () => onSave({ blocks: rows, html: exportToHtml(rows, canvasStyle) });

  const handleDeselect = () => { setSelectedBlockId(null); setSelectedRowId(null); setShowLayouts(false); };

  return (
    <div className="h-screen flex flex-col bg-white">
      <BuilderToolbar
        templateName={templateName}
        onNameChange={onNameChange}
        previewMode={previewMode}
        setPreviewMode={setPreviewMode}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onClose={onClose}
        onSave={handleSave}
        onTest={() => setShowTestModal(true)}
        saving={saving}
        canSave={!saving && !!templateName.trim()}
        languageSlot={languageSlot}
      />

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="flex-1 flex overflow-hidden relative">
          {!previewMode && (
            <BuilderSidebar showLayouts={showLayouts} onToggleLayouts={() => setShowLayouts(!showLayouts)} onAddRow={addRow} />
          )}

          {previewMode ? (
            <div className="flex-1 overflow-y-auto bg-gray-100 flex justify-center py-8 px-4">
              <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden transition-all" style={{ width: viewMode === "mobile" ? "375px" : `${canvasStyle.width}px` }}>
                <iframe srcDoc={exportToHtml(rows, canvasStyle)} className="w-full h-full min-h-[600px] border-0" title="Vista previa" />
              </div>
            </div>
          ) : (
            <BuilderCanvas
              rows={rows}
              setRows={setRows}
              selectedBlockId={selectedBlockId}
              selectedRowId={selectedRowId}
              setSelectedBlockId={setSelectedBlockId}
              setSelectedRowId={setSelectedRowId}
              overCellId={overCellId}
              activeDragType={activeDragType}
              onShowLayouts={() => setShowLayouts(true)}
              onDeleteRow={deleteRow}
              onDeleteBlock={deleteBlock}
              onDeselect={handleDeselect}
              canvasStyle={canvasStyle}
              viewMode={viewMode}
            />
          )}

          {!previewMode && (
            <BuilderPropertiesPanel
              selectedBlock={selectedBlock}
              selectedRowId={selectedRowId}
              rows={rows}
              onDeleteBlock={deleteBlock}
              onUpdateBlockProps={updateBlockProps}
              onAddBlockToCell={addBlockToCell}
              onUpdateRowStyle={updateRowStyle}
              templateSubject={templateSubject}
              onSubjectChange={onSubjectChange}
              canvasStyle={canvasStyle}
              onCanvasStyleChange={setCanvasStyle}
            />
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDragType ? (
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white shadow-xl border border-brand-300">
              {(() => { const Icon = BLOCK_ICONS[activeDragType]; return <Icon className="h-5 w-5 text-brand-600" />; })()}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <TestEmailModal
        open={showTestModal}
        onClose={() => setShowTestModal(false)}
        subject={templateSubject}
        html={exportToHtml(rows, canvasStyle)}
      />
    </div>
  );
}
