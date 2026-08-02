import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploaderProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
}

export function FileUploader({ onFileSelected, isLoading }: FileUploaderProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileSelected(acceptedFiles[0]);
      }
    },
    [onFileSelected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-excel": [".xls"],
    },
    multiple: false,
    disabled: isLoading,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all",
        isDragActive
          ? "border-indigo-400 bg-indigo-50"
          : "border-gray-300 bg-gray-50/50 hover:border-indigo-300 hover:bg-indigo-50/30",
        isLoading && "cursor-not-allowed opacity-60"
      )}
    >
      <input {...getInputProps()} />
      {isLoading ? (
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin text-indigo-500">
            <Upload className="h-10 w-10" />
          </div>
          <p className="text-lg text-gray-600">Procesando archivo...</p>
        </div>
      ) : isDragActive ? (
        <div className="flex flex-col items-center gap-3">
          <FileSpreadsheet className="h-12 w-12 text-indigo-500" />
          <p className="text-lg font-medium text-indigo-600">
            Suelta el archivo aquí...
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <FileSpreadsheet className="h-12 w-12 text-gray-400" />
          <div>
            <p className="text-lg font-medium text-gray-700">
              Arrastra un archivo CSV o Excel aquí
            </p>
            <p className="text-sm text-gray-500 mt-1">
              o haz clic para seleccionar (.csv, .xlsx, .xls)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
