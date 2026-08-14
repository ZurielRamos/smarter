import { useState, useEffect, useRef } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

export interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  /** If set, user must type this exact text to enable the confirm button */
  verificationText?: string;
  /** Placeholder for the verification input */
  verificationPlaceholder?: string;
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "default",
  verificationText,
  verificationPlaceholder,
  loading = false,
}: ConfirmModalProps) {
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setInputValue("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  if (!open) return null;

  const needsVerification = !!verificationText;
  const isVerified = !needsVerification || inputValue === verificationText;
  const busy = loading || isProcessing;

  const handleConfirm = async () => {
    if (!isVerified || busy) return;
    setIsProcessing(true);
    try {
      await onConfirm();
    } finally {
      setIsProcessing(false);
    }
  };

  const variantStyles = {
    danger: {
      icon: "bg-red-50 text-red-600",
      button: "bg-red-600 hover:bg-red-700 text-white",
    },
    warning: {
      icon: "bg-amber-50 text-amber-600",
      button: "bg-amber-600 hover:bg-amber-700 text-white",
    },
    default: {
      icon: "bg-brand-50 text-brand-600",
      button: "bg-brand-700 hover:bg-brand-600 text-white",
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-150"
        onClick={busy ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={busy}
          className="absolute top-3 right-3 p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Body */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${styles.icon}`}>
              <AlertTriangle className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
              {description && (
                <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">{description}</p>
              )}
            </div>
          </div>

          {/* Verification input */}
          {needsVerification && (
            <div className="mt-4">
              <p className="text-[11px] text-gray-500 mb-1.5">
                Escribe <span className="font-mono font-semibold text-gray-700">{verificationText}</span> para confirmar
              </p>
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={verificationPlaceholder || verificationText}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 font-mono"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && isVerified) handleConfirm();
                }}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isVerified || busy}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles.button}`}
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
