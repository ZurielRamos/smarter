import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Braces } from "lucide-react";
import type { Variable } from "./RichTextEditor";

interface VariableInputProps {
  value: string;
  onChange: (value: string) => void;
  variables: Variable[];
  placeholder?: string;
  className?: string;
}

/**
 * A plain text input with {{ variable autocomplete.
 * When the user types `{{`, a dropdown appears with filtered variables.
 * Selecting a variable inserts `{{field}}` at the cursor position.
 */
export function VariableInput({ value, onChange, variables, placeholder, className }: VariableInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [autocomplete, setAutocomplete] = useState<{ open: boolean; search: string; startPos: number } | null>(null);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const checkAutocomplete = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;

    const cursorPos = input.selectionStart ?? 0;
    const textBefore = value.slice(0, cursorPos);

    const lastOpen = textBefore.lastIndexOf("{{");
    if (lastOpen === -1) {
      setAutocomplete(null);
      return;
    }

    const afterOpen = textBefore.slice(lastOpen);
    if (afterOpen.includes("}}")) {
      setAutocomplete(null);
      return;
    }

    const search = textBefore.slice(lastOpen + 2);

    // Position dropdown below input
    const rect = input.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: rect.left });

    setAutocomplete((prev) => {
      if (!prev || prev.search !== search) {
        setAutocompleteIndex(0);
      }
      return { open: true, search, startPos: lastOpen };
    });
  }, [value]);

  const getFilteredVariables = () => {
    if (!autocomplete) return [];
    const s = autocomplete.search.toLowerCase();
    return variables.filter(
      (v) => v.field.toLowerCase().includes(s) || v.label.toLowerCase().includes(s)
    );
  };

  const selectVariable = (variable: Variable) => {
    if (!autocomplete || !inputRef.current) return;

    const cursorPos = inputRef.current.selectionStart ?? value.length;
    const before = value.slice(0, autocomplete.startPos);
    const after = value.slice(cursorPos);
    const replacement = `{{${variable.field}}}`;
    const newValue = before + replacement + after;
    onChange(newValue);

    setAutocomplete(null);

    // Restore cursor after the inserted variable
    const newPos = before.length + replacement.length;
    setTimeout(() => {
      inputRef.current?.setSelectionRange(newPos, newPos);
      inputRef.current?.focus();
    }, 0);
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
      selectVariable(filtered[autocompleteIndex]);
    } else if (e.key === "Escape") {
      setAutocomplete(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    // Check autocomplete after state update
    setTimeout(() => checkAutocomplete(), 0);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={() => checkAutocomplete()}
        onBlur={() => setTimeout(() => setAutocomplete(null), 150)}
        placeholder={placeholder}
        className={className || "flex-1 px-2.5 py-1.5 text-xs focus:outline-none"}
      />

      {autocomplete?.open && (() => {
        const filtered = getFilteredVariables();
        if (filtered.length === 0) return null;
        return createPortal(
          <div
            className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 w-[220px] max-h-[180px] overflow-y-auto py-1"
            style={{ top: coords.top, left: Math.min(coords.left, window.innerWidth - 230) }}
          >
            {filtered.map((v, i) => (
              <button
                key={v.field}
                onMouseDown={(e) => { e.preventDefault(); selectVariable(v); }}
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
    </>
  );
}
