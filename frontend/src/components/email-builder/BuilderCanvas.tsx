import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, LayoutGrid, Plus } from "lucide-react";
import type { EmailRow, BlockType } from "./types";
import { BlockRenderer } from "./BlockRenderer";

// Droppable cell
function DroppableCell({ cellId, rowId, isOver, style, children, rowHasContent, heightMode }: { cellId: string; rowId: string; isOver: boolean; style?: React.CSSProperties; children: React.ReactNode; rowHasContent?: boolean; heightMode?: string }) {
  const { setNodeRef } = useDroppable({
    id: `cell-${rowId}-${cellId}`,
    data: { cellId, rowId },
  });

  const showMinHeight = !rowHasContent;
  const stretch = heightMode === "fixed" || heightMode === "min";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border-r last:border-r-0 border-dashed border-gray-200 ${showMinHeight ? "min-h-[80px]" : ""} ${stretch ? "flex-1" : ""} transition-colors flex flex-col ${isOver ? "bg-brand-50/50" : ""}`}
    >
      {children}
    </div>
  );
}

// Sortable row wrapper
function SortableRow({ row, children }: { row: EmailRow; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="relative group/row cursor-grab active:cursor-grabbing">
      {children}
    </div>
  );
}

interface BuilderCanvasProps {
  rows: EmailRow[];
  setRows: React.Dispatch<React.SetStateAction<EmailRow[]>>;
  selectedBlockId: string | null;
  selectedRowId: string | null;
  setSelectedBlockId: (id: string | null) => void;
  setSelectedRowId: (id: string | null) => void;
  overCellId: string | null;
  activeDragType: BlockType | null;
  onShowLayouts: () => void;
  onDeleteRow: (id: string) => void;
  onDeleteBlock: (id: string) => void;
  onDeselect: () => void;
  canvasStyle: { paddingTop: number; paddingRight: number; paddingBottom: number; paddingLeft: number; width: number; backgroundColor: string; backgroundImage: string };
  viewMode: "desktop" | "mobile";
}

export function BuilderCanvas({
  rows, setRows, selectedBlockId, selectedRowId, setSelectedBlockId, setSelectedRowId,
  overCellId, activeDragType, onShowLayouts, onDeleteRow, onDeleteBlock, onDeselect, canvasStyle, viewMode,
}: BuilderCanvasProps) {
  const effectiveWidth = viewMode === "mobile" ? Math.min(375, canvasStyle.width) : canvasStyle.width;
  return (
    <div className="flex-1 overflow-y-auto bg-gray-100 flex justify-center py-8 px-4" onClick={onDeselect}>
      <div style={{ width: `${effectiveWidth}px`, transition: "width 0.3s ease" }} onClick={(e) => e.stopPropagation()}>
        {/* Rows canvas */}
        <div
          className="rounded-lg shadow-md border border-gray-200 min-h-[500px]"
          style={{
            paddingTop: `${canvasStyle.paddingTop}px`,
            paddingRight: `${canvasStyle.paddingRight}px`,
            paddingBottom: `${canvasStyle.paddingBottom}px`,
            paddingLeft: `${canvasStyle.paddingLeft}px`,
            backgroundColor: canvasStyle.backgroundColor,
            backgroundImage: canvasStyle.backgroundImage ? `url(${canvasStyle.backgroundImage})` : undefined,
            backgroundSize: canvasStyle.backgroundImage ? "cover" : undefined,
            backgroundPosition: canvasStyle.backgroundImage ? "center" : undefined,
            backgroundRepeat: canvasStyle.backgroundImage ? "no-repeat" : undefined,
          }}
        >
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer" onClick={onShowLayouts}>
              <LayoutGrid className="h-8 w-8 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500 mb-1">Agrega una fila</p>
              <p className="text-xs text-gray-400">Usa el boton Layouts para agregar una estructura</p>
            </div>
          ) : (
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              <div className="overflow-visible">
                {rows.map((row) => {
                  const rs = row.style;
                  const rowInlineStyle: React.CSSProperties = rs ? {
                    marginTop: `${rs.marginTop}px`,
                    marginRight: `${rs.marginRight}px`,
                    marginBottom: `${rs.marginBottom}px`,
                    marginLeft: `${rs.marginLeft}px`,
                    backgroundColor: rs.backgroundColor,
                    backgroundImage: rs.backgroundImage ? `url(${rs.backgroundImage})` : undefined,
                    backgroundSize: rs.backgroundImage ? rs.backgroundSize : undefined,
                    backgroundPosition: rs.backgroundImage ? rs.backgroundPosition : undefined,
                    backgroundRepeat: rs.backgroundImage ? rs.backgroundRepeat as any : undefined,
                    borderWidth: rs.borderWidth > 0 ? `${rs.borderWidth}px` : undefined,
                    borderStyle: rs.borderWidth > 0 ? "solid" : undefined,
                    borderColor: rs.borderWidth > 0 ? rs.borderColor : undefined,
                    borderRadius: rs.borderRadius > 0 ? `${rs.borderRadius}px` : undefined,
                    height: rs.heightMode === "fixed" ? `${rs.height || 100}px` : undefined,
                    minHeight: rs.heightMode === "min" ? `${rs.minHeight || 50}px` : undefined,
                  } : {};
                  const cellsContainerStyle: React.CSSProperties = rs ? {
                    paddingTop: `${rs.paddingTop}px`,
                    paddingRight: `${rs.paddingRight}px`,
                    paddingBottom: `${rs.paddingBottom}px`,
                    paddingLeft: `${rs.paddingLeft}px`,
                    gap: rs.gap > 0 ? `${rs.gap}px` : undefined,
                  } : {};

                  return (
                  <SortableRow key={row.id} row={row}>
                    <div
                      className={`relative border-2 transition-colors ${rs?.heightMode === "fixed" || rs?.heightMode === "min" ? "flex flex-col" : ""} ${selectedRowId === row.id && !selectedBlockId ? "border-brand-400" : "border-gray-200 hover:border-gray-300"}`}
                      style={rowInlineStyle}
                      onClick={(e) => { e.stopPropagation(); setSelectedRowId(row.id); setSelectedBlockId(null); }}
                    >
                      {/* Delete row */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteRow(row.id); }}
                        className="absolute -top-2 -right-2 opacity-0 group-hover/row:opacity-100 transition-opacity p-1 rounded-full bg-white border border-gray-200 shadow-sm hover:bg-red-50 hover:border-red-200 text-gray-400 hover:text-red-500 z-10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>

                      {/* Cells */}
                      <div className={`flex${rs?.heightMode === "fixed" || rs?.heightMode === "min" ? " flex-1" : ""}`} style={cellsContainerStyle}>
                        {row.cells.map((cell, cellIndex) => {
                          const totalW = row.cells.reduce((s, c) => s + c.width, 0);
                          const isCellOver = overCellId === cell.id && activeDragType !== null;
                          return (
                            <div key={cell.id} className="relative flex" style={{ flex: cell.width / totalW }}>
                              <DroppableCell cellId={cell.id} rowId={row.id} isOver={isCellOver} style={{ flex: 1 }} rowHasContent={row.cells.some((c) => c.blocks.length > 0)} heightMode={rs?.heightMode}>
                                {cell.blocks.length === 0 ? (
                                  <div className={`flex flex-col items-center justify-center h-full min-h-[80px] border border-dashed rounded transition-colors ${isCellOver ? "border-brand-400 bg-brand-100/50" : "border-blue-200 bg-blue-50/30"}`}>
                                    <Plus className={`h-4 w-4 mb-0.5 ${isCellOver ? "text-brand-500" : "text-blue-300"}`} />
                                    <span className={`text-[9px] ${isCellOver ? "text-brand-600 font-medium" : "text-blue-400"}`}>
                                      {isCellOver ? "Soltar aqui" : "Soltar contenido"}
                                    </span>
                                  </div>
                                ) : (
                                  (() => {
                                    const vAlign = cell.blocks[0]?.props?.verticalAlign || "top";
                                    const justifyClass = vAlign === "middle" ? "justify-center" : vAlign === "bottom" ? "justify-end" : "justify-start";
                                    return (
                                      <div className={`flex flex-col gap-1 flex-1 ${justifyClass}`}>
                                        {cell.blocks.map((block) => (
                                          <div key={block.id} className="relative group/block">
                                            <button
                                              onClick={(e) => { e.stopPropagation(); onDeleteBlock(block.id); }}
                                              className="absolute -top-1 -right-1 opacity-0 group-hover/block:opacity-100 transition-opacity p-0.5 rounded-full bg-white border border-gray-200 shadow-sm hover:bg-red-50 text-gray-400 hover:text-red-500 z-10"
                                            >
                                              <Trash2 className="h-2.5 w-2.5" />
                                            </button>
                                            <BlockRenderer
                                              block={block}
                                              selected={selectedBlockId === block.id}
                                              onClick={() => { setSelectedBlockId(block.id); setSelectedRowId(row.id); }}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()
                                )}
                              </DroppableCell>
                              {/* Resize handle — positioned at the center of the gap between cells */}
                              {cellIndex < row.cells.length - 1 && (
                                <div
                                  className="absolute top-0 bottom-0 w-4 cursor-col-resize flex items-center justify-center z-10 hover:bg-brand-100/50 transition-colors group/resize"
                                  style={{ right: `-${((rs?.gap || 0) / 2) + 8}px` }}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const startX = e.clientX;
                                    const handle = e.currentTarget as HTMLElement;
                                    const rowContainer = handle.parentElement!.parentElement!;
                                    const containerWidth = rowContainer.getBoundingClientRect().width;
                                    const cells = row.cells;
                                    const totalW = cells.reduce((s, c) => s + c.width, 0);
                                    const startLeftW = cells[cellIndex].width;
                                    const startRightW = cells[cellIndex + 1].width;

                                    const onMove = (ev: MouseEvent) => {
                                      const deltaW = ((ev.clientX - startX) / containerWidth) * totalW;
                                      let newLeftW = startLeftW + deltaW;
                                      let newRightW = startRightW - deltaW;
                                      const minW = totalW * 0.08;
                                      if (newLeftW < minW) { newLeftW = minW; newRightW = startLeftW + startRightW - minW; }
                                      if (newRightW < minW) { newRightW = minW; newLeftW = startLeftW + startRightW - minW; }
                                      setRows((prev) => prev.map((r) => {
                                        if (r.id !== row.id) return r;
                                        return { ...r, cells: r.cells.map((c, i) => {
                                          if (i === cellIndex) return { ...c, width: newLeftW };
                                          if (i === cellIndex + 1) return { ...c, width: newRightW };
                                          return c;
                                        })};
                                      }));
                                    };
                                    const onUp = () => {
                                      document.removeEventListener("mousemove", onMove);
                                      document.removeEventListener("mouseup", onUp);
                                      document.body.style.cursor = "";
                                      document.body.style.userSelect = "";
                                    };
                                    document.body.style.cursor = "col-resize";
                                    document.body.style.userSelect = "none";
                                    document.addEventListener("mousemove", onMove);
                                    document.addEventListener("mouseup", onUp);
                                  }}
                                >
                                  <div className="w-0.5 h-8 bg-gray-300 rounded-full group-hover/resize:bg-brand-500 transition-colors" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </SortableRow>
                  );
                })}
              </div>
            </SortableContext>
          )}

        </div>
      </div>
    </div>
  );
}
