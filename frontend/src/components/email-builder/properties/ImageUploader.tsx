import { useState, useRef } from "react";
import { Upload, Trash2, Link } from "lucide-react";

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  compact?: boolean;
}

export function ImageUploader({ value, onChange, compact }: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    onChange(url);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  // Has image — show preview
  if (value) {
    return (
      <div className="space-y-2">
        <div className="relative rounded-lg border border-gray-200 overflow-hidden bg-gray-50 group">
          <div className="h-20 bg-center bg-cover" style={{ backgroundImage: `url(${value})` }} />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-md bg-white/90 text-gray-700 hover:bg-white shadow-sm"
              title="Cambiar"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onChange("")}
              className="p-1.5 rounded-md bg-white/90 text-red-600 hover:bg-white shadow-sm"
              title="Eliminar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>
    );
  }

  // No image — show upload area
  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg ${compact ? "p-3" : "p-4"} flex flex-col items-center justify-center cursor-pointer transition-colors ${dragOver ? "border-brand-400 bg-brand-50" : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"}`}
      >
        <Upload className={`${compact ? "h-4 w-4" : "h-5 w-5"} ${dragOver ? "text-brand-500" : "text-gray-400"} mb-1`} />
        <p className="text-[10px] font-medium text-gray-600 text-center">
          {compact ? "Soltar o seleccionar" : "Arrastra una imagen o haz clic"}
        </p>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {/* URL option */}
      {!showUrlInput ? (
        <button onClick={() => setShowUrlInput(true)} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600">
          <Link className="h-3 w-3" /> Pegar URL
        </button>
      ) : (
        <div className="flex gap-1">
          <input
            type="text"
            placeholder="https://..."
            className="flex-1 px-2 py-1 rounded-md border border-gray-200 text-[10px] focus:outline-none focus:ring-2 focus:ring-brand-500"
            onKeyDown={(e) => { if (e.key === "Enter") { onChange((e.target as HTMLInputElement).value.trim()); setShowUrlInput(false); } }}
          />
          <button onClick={() => setShowUrlInput(false)} className="text-[10px] text-gray-400 px-1">X</button>
        </div>
      )}
    </div>
  );
}
