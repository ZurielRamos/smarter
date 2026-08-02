import { FileSpreadsheet, Columns, Rows3 } from "lucide-react";

interface DataPreviewProps {
  headers: string[];
  preview: Record<string, string>[];
  totalRows: number;
}

export function DataPreview({ headers, preview, totalRows }: DataPreviewProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Info bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center">
            <FileSpreadsheet className="h-4.5 w-4.5 text-brand-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Vista previa del archivo</h3>
            <p className="text-xs text-gray-400">Verifica que los datos se cargaron correctamente antes de continuar</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Rows3 className="h-3.5 w-3.5" />
            <span><strong className="text-gray-700">{totalRows.toLocaleString()}</strong> filas</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Columns className="h-3.5 w-3.5" />
            <span><strong className="text-gray-700">{headers.length}</strong> columnas</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 font-medium">
            Mostrando {preview.length} de {totalRows.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap w-10">#</th>
              {headers.map((header) => (
                <th
                  key={header}
                  className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, idx) => (
              <tr
                key={idx}
                className="border-b border-gray-50 hover:bg-brand-50/30 transition-colors"
              >
                <td className="px-3 py-2 text-[11px] text-gray-400 font-mono">{idx + 1}</td>
                {headers.map((header) => (
                  <td
                    key={header}
                    className="px-3 py-2 whitespace-nowrap text-gray-700 text-[13px]"
                  >
                    {row[header] || <span className="text-gray-300">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
