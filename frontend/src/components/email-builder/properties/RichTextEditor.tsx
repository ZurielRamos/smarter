import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Bold, Italic, Underline, Link, List, ListOrdered, Strikethrough, Braces, ChevronDown } from "lucide-react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getCustomFields } from "@/services/api";
import type { CustomField } from "@/services/api";

export interface Variable {
  field: string;
  label: string;
  group: string;
}

/* ─── Hook: load contact variables ─── */
export function useContactVariables(): Variable[] {
  const [variables, setVariables] = useState<Variable[]>([]);
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantId = user?.tenantRoles.find((tr: any) => tr.tenant.slug === slug)?.tenantId || "";

  useEffect(() => {
    if (!tenantId) return;
    getCustomFields(tenantId).then((fields: CustomField[]) => {
      const vars: Variable[] = fields
        .filter((f) => f.fieldType !== "computed")
        .map((f) => ({
          field: f.fieldKey,
          label: f.fieldLabel,
          group: f.isSystem ? "Campos del contacto" : (f.fieldGroup || "Campos personalizados"),
        }));
      setVariables(vars);
    }).catch(() => {});
  }, [tenantId]);

  return variables;
}

/* ─── Variables Dropdown ─── */
function VariablesDropdown({ variables, onSelect }: { variables: Variable[]; onSelect: (v: Variable) => void }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - 220) });
    }
    setOpen(true);
    setSearch("");
  };

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const filtered = variables.filter(
    (v) => v.label.toLowerCase().includes(search.toLowerCase()) || v.field.toLowerCase().includes(search.toLowerCase())
  );

  const grouped: Record<string, Variable[]> = {};
  for (const v of filtered) {
    if (!grouped[v.group]) grouped[v.group] = [];
    grouped[v.group].push(v);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className="h-7 flex items-center gap-0.5 px-1.5 rounded transition-colors text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        title="Insertar variable"
      >
        <Braces className="h-3.5 w-3.5" />
        <ChevronDown className="h-2.5 w-2.5" />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 w-[210px] overflow-hidden"
          style={{ top: coords.top, left: coords.left }}
        >
          <div className="px-2 pt-2 pb-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar campo..."
              className="w-full px-2 py-1.5 rounded-md border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
              autoFocus
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto pb-1">
            {Object.keys(grouped).length === 0 && (
              <p className="text-xs text-gray-400 px-3 py-2">Sin resultados</p>
            )}
            {Object.entries(grouped).map(([group, vars]) => (
              <div key={group}>
                <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide px-3 pt-2 pb-1">{group}</p>
                {vars.map((v) => (
                  <button
                    key={v.field}
                    onClick={() => { onSelect(v); setOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-brand-50 hover:text-brand-700 transition-colors flex items-center gap-2"
                  >
                    <Braces className="h-3 w-3 text-gray-400 shrink-0" />
                    <span className="truncate">{v.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

/* ─── Rich Text Editor ─── */
export function RichTextEditor({ value, onChange, variables, minHeight = "120px" }: { value: string; onChange: (html: string) => void; variables: Variable[]; minHeight?: string }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const savedRangeRef = useRef<Range | null>(null);

  // Autocomplete state
  const [autocomplete, setAutocomplete] = useState<{ open: boolean; search: string; coords: { top: number; left: number }; startOffset: number } | null>(null);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    isInternalChange.current = true;
    onChange(editorRef.current.innerHTML);
    checkAutocomplete();
  }, [onChange]);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  // Check if we're inside a {{ trigger
  const checkAutocomplete = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) {
      setAutocomplete(null);
      return;
    }

    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      setAutocomplete(null);
      return;
    }

    const text = node.textContent || "";
    const cursorPos = sel.anchorOffset;
    const textBefore = text.slice(0, cursorPos);

    // Find the last {{ that hasn't been closed
    const lastOpen = textBefore.lastIndexOf("{{");
    if (lastOpen === -1) {
      setAutocomplete(null);
      return;
    }

    // Check if there's a }} between the {{ and cursor
    const afterOpen = textBefore.slice(lastOpen);
    if (afterOpen.includes("}}")) {
      setAutocomplete(null);
      return;
    }

    const search = textBefore.slice(lastOpen + 2); // text after {{

    // Get caret position for dropdown placement
    const range = sel.getRangeAt(0).cloneRange();
    range.setStart(node, lastOpen);
    const rect = range.getBoundingClientRect();
    const editorRect = editorRef.current.getBoundingClientRect();

    setAutocomplete((prev) => {
      const newState = {
        open: true,
        search,
        coords: {
          top: rect.bottom - editorRect.top + 4,
          left: rect.left - editorRect.left,
        },
        startOffset: lastOpen,
      };
      // Only reset index if search changed
      if (!prev || prev.search !== search) {
        setAutocompleteIndex(0);
      }
      return newState;
    });
  }, []);

  const getFilteredVariables = () => {
    if (!autocomplete) return [];
    const s = autocomplete.search.toLowerCase();
    return variables.filter(
      (v) => v.field.toLowerCase().includes(s) || v.label.toLowerCase().includes(s)
    );
  };

  const selectAutocomplete = (variable: Variable) => {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode || !autocomplete) return;

    const node = sel.anchorNode;
    if (node.nodeType !== Node.TEXT_NODE) return;

    const text = node.textContent || "";
    const cursorPos = sel.anchorOffset;

    // Replace from {{ to cursor with {{field}}
    const before = text.slice(0, autocomplete.startOffset);
    const after = text.slice(cursorPos);
    const replacement = `{{${variable.field}}}`;
    node.textContent = before + replacement + after;

    // Move cursor after the inserted variable
    const newPos = before.length + replacement.length;
    const range = document.createRange();
    range.setStart(node, newPos);
    range.setEnd(node, newPos);
    sel.removeAllRanges();
    sel.addRange(range);

    setAutocomplete(null);
    editorRef.current?.focus();
    handleInput();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!autocomplete?.open) return;
    const filtered = getFilteredVariables();
    if (filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAutocompleteIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAutocompleteIndex((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      selectAutocomplete(filtered[autocompleteIndex]);
    } else if (e.key === "Escape") {
      setAutocomplete(null);
    }
  };

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
    handleInput();
  };

  const handleLink = () => {
    const url = prompt("URL del enlace:");
    if (url) exec("createLink", url);
  };

  const insertVariable = (variable: Variable) => {
    const editor = editorRef.current;
    if (!editor) return;

    const textNode = document.createTextNode(`{{${variable.field}}}`);

    const sel = window.getSelection();
    if (savedRangeRef.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editor.appendChild(textNode);
    }

    editor.focus();
    handleInput();
  };

  const btnCls = () =>
    `w-7 h-7 flex items-center justify-center rounded transition-colors text-gray-500 hover:bg-gray-100 hover:text-gray-700`;

  return (
    <div className="relative border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-brand-500">
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200 flex-wrap">
        <button type="button" onClick={() => exec("bold")} className={btnCls()} title="Negrita">
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => exec("italic")} className={btnCls()} title="Cursiva">
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => exec("underline")} className={btnCls()} title="Subrayado">
          <Underline className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => exec("strikeThrough")} className={btnCls()} title="Tachado">
          <Strikethrough className="h-3.5 w-3.5" />
        </button>
        <div className="w-px h-4 bg-gray-300 mx-0.5" />
        <button type="button" onClick={() => exec("insertUnorderedList")} className={btnCls()} title="Lista">
          <List className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => exec("insertOrderedList")} className={btnCls()} title="Lista numerada">
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
        <div className="w-px h-4 bg-gray-300 mx-0.5" />
        <button type="button" onClick={handleLink} className={btnCls()} title="Enlace">
          <Link className="h-3.5 w-3.5" />
        </button>
        <div className="w-px h-4 bg-gray-300 mx-0.5" />
        <VariablesDropdown variables={variables} onSelect={insertVariable} />
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => { if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) { saveSelection(); checkAutocomplete(); } }}
        onMouseUp={saveSelection}
        onBlur={() => { saveSelection(); setTimeout(() => setAutocomplete(null), 150); }}
        style={{ minHeight }}
        className="relative max-h-[240px] overflow-y-auto px-3 py-2 text-xs text-gray-800 leading-relaxed focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-brand-600 [&_a]:underline [&_b]:font-semibold"
        data-placeholder="Escribe tu contenido aqui..."
      />

      {/* Autocomplete dropdown - rendered via portal */}
      {autocomplete?.open && (() => {
        const filtered = getFilteredVariables();
        if (filtered.length === 0) return null;
        const editorRect = editorRef.current?.getBoundingClientRect();
        if (!editorRect) return null;
        return createPortal(
          <div
            ref={autocompleteRef}
            className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 w-[220px] max-h-[180px] overflow-y-auto py-1"
            style={{
              top: editorRect.top + autocomplete.coords.top,
              left: Math.min(editorRect.left + autocomplete.coords.left, window.innerWidth - 230),
            }}
          >
            {filtered.map((v, i) => (
              <button
                key={v.field}
                onMouseDown={(e) => { e.preventDefault(); selectAutocomplete(v); }}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                  i === autocompleteIndex ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Braces className="h-3 w-3 text-gray-400 shrink-0" />
                <span className="truncate flex-1">{v.label}</span>
                <span className="text-[9px] text-gray-400">{v.field}</span>
              </button>
            ))}
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
