import type { OrganizationStatus, OrganizationType } from "@/services/companies";
import { ORGANIZATION_TYPE_LABELS } from "@/services/companies";

const TYPE_CLS: Record<OrganizationType, string> = {
  client: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  establishment: "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  other: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300",
};

const STATUS_CLS: Record<OrganizationStatus, { label: string; cls: string }> = {
  active: { label: "Activa", cls: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  inactive: { label: "Inactiva", cls: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300" },
};

const pill = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium";

export function TypeBadge({ type }: { type: OrganizationType }) {
  return <span className={`${pill} ${TYPE_CLS[type]}`}>{ORGANIZATION_TYPE_LABELS[type]}</span>;
}

export function StatusBadge({ status }: { status: OrganizationStatus }) {
  const s = STATUS_CLS[status];
  return <span className={`${pill} ${s.cls}`}>{s.label}</span>;
}
