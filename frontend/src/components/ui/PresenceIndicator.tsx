import type { PresenceStatus } from "@/hooks/usePresence";

interface PresenceIndicatorProps {
  status: PresenceStatus;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

const colorMap: Record<PresenceStatus, string> = {
  online: "bg-green-500",
  away: "bg-amber-400",
  offline: "bg-gray-300",
};

export function PresenceIndicator({ status, size = "sm", className = "" }: PresenceIndicatorProps) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-white ${sizeMap[size]} ${colorMap[status]} ${className}`}
      title={status === "online" ? "En línea" : status === "away" ? "Ausente" : "Desconectado"}
    />
  );
}
