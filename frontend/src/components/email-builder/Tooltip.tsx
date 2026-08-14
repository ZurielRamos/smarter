import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export function Tooltip({ label, description, children, disabled }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setCoords({
          top: rect.top + rect.height / 2,
          left: rect.right + 14,
        });
      }
      setVisible(true);
      requestAnimationFrame(() => setAnimating(true));
    }, 350);
  };

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setAnimating(false);
    setTimeout(() => setVisible(false), 150);
  };

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  useEffect(() => {
    if (disabled && visible) hide();
  }, [disabled]);

  return (
    <div ref={triggerRef} onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: coords.top,
            left: coords.left,
            transform: `translateY(-50%) translateX(${animating ? "0" : "-8px"}) scale(${animating ? "1" : "0.95"})`,
            opacity: animating ? 1 : 0,
            transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease",
          }}
        >
          <div className="bg-gray-900 text-white rounded-xl px-4 py-2.5 shadow-2xl">
            <p className="text-sm font-semibold leading-tight">{label}</p>
            {description && <p className="text-xs text-gray-400 mt-1 max-w-[200px] leading-snug">{description}</p>}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
