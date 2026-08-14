import { ArrowLeft, Undo2, Redo2, Eye, Monitor, Smartphone, Save, SendHorizontal } from "lucide-react";
import logoIcon from "@/assets/icon.svg";

interface BuilderToolbarProps {
  templateName: string;
  onNameChange: (v: string) => void;
  previewMode: boolean;
  setPreviewMode: (v: boolean) => void;
  viewMode: "desktop" | "mobile";
  setViewMode: (v: "desktop" | "mobile") => void;
  onClose: () => void;
  onSave: () => void;
  onTest: () => void;
  saving: boolean;
  canSave: boolean;
  languageSlot?: React.ReactNode;
}

export function BuilderToolbar({ templateName, onNameChange, previewMode, setPreviewMode, viewMode, setViewMode, onClose, onSave, onTest, saving, canSave, languageSlot }: BuilderToolbarProps) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white shrink-0">
      <div className="flex items-center gap-4">
        <img src={logoIcon} alt="Logo" className="h-7 w-7" />
        <button onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-brand-700 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <input
          type="text"
          value={templateName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Nombre de la plantilla"
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 w-56"
        />
        {/* Language dropdown slot */}
        {languageSlot}
        <div className="flex items-center gap-1 ml-1">
          <button className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors" disabled><Undo2 className="h-5 w-5" /></button>
          <button className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors" disabled><Redo2 className="h-5 w-5" /></button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* Desktop / Mobile toggle */}
        <div className="flex items-center bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode("desktop")}
            className={`p-2 rounded-md transition-colors ${viewMode === "desktop" ? "bg-white shadow-sm text-brand-700" : "text-gray-400 hover:text-gray-600"}`}
            title="Escritorio"
          >
            <Monitor className="h-5 w-5" />
          </button>
          <button
            onClick={() => setViewMode("mobile")}
            className={`p-2 rounded-md transition-colors ${viewMode === "mobile" ? "bg-white shadow-sm text-brand-700" : "text-gray-400 hover:text-gray-600"}`}
            title="Movil"
          >
            <Smartphone className="h-5 w-5" />
          </button>
        </div>
        {/* Preview toggle */}
        <button
          onClick={() => setPreviewMode(!previewMode)}
          className={`p-2 rounded-lg transition-colors ${previewMode ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200" : "text-gray-400 hover:bg-gray-100 hover:text-brand-600"}`}
          title="Vista previa"
        >
          <Eye className="h-5 w-5" />
        </button>
        <button onClick={onTest} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-200 text-sm font-medium text-brand-700 hover:bg-brand-50 transition-colors">
          <SendHorizontal className="h-4 w-4" />Probar
        </button>
        <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
        <button onClick={onSave} disabled={!canSave} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium disabled:opacity-50 transition-colors">
          <Save className="h-4 w-4" />{saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}
