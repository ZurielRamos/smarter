import type { ProspectStatus } from "@/services/recruitPortal";

/** Cómo se le cuenta a la persona su estado. El estado interno y el motivo de un descarte nunca se muestran. */
export const MY_STATUS: Record<ProspectStatus, { label: string; text: string; cls: string }> = {
  received: { label: "Recibido", text: "Recibimos tu registro. Revisaremos tu información y te contactaremos.", cls: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  in_process: { label: "En proceso", text: "Estamos revisando tu perfil para este proyecto. Te contactaremos.", cls: "bg-brand-50 text-brand-700 dark:bg-brand-700/30 dark:text-brand-100" },
  selected: { label: "Seleccionado", text: "Quedaste seleccionado. Te contactaremos con los siguientes pasos.", cls: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  not_selected: { label: "No seleccionado", text: "Por ahora no fuiste seleccionado en este proyecto. Gracias por tu interés.", cls: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300" },
  finished: { label: "Finalizado", text: "Tu participación en este proyecto terminó. Gracias.", cls: "bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300" },
};

export const ROLE_LABEL: Record<"participant" | "surveyor" | "moderator", string> = {
  participant: "Participante",
  surveyor: "Encuestador",
  moderator: "Moderador",
};
