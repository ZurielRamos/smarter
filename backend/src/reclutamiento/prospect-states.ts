/**
 * Perfiles de una persona dentro de un proyecto y los estados por los que pasa.
 * Los estados son los mismos para todos los perfiles y son fijos: el perfil dice
 * qué hace la persona; el estado, en qué punto va. La calidad de su
 * participación se registra con la calificación, no con estados.
 *
 * - `public`: cómo se le cuenta a la persona su estado. Nunca ve el estado
 *   interno ni el motivo de un descarte.
 * - `negative`: descarte; admite un motivo interno.
 * - `participated`: cuenta como participación efectiva (para la última
 *   participación y el número de participaciones de la persona).
 */
export const PROSPECT_ROLES = ['participant', 'surveyor', 'moderator'] as const;
export type ProspectRole = (typeof PROSPECT_ROLES)[number];

export const ROLE_LABELS: Record<ProspectRole, string> = {
  participant: 'Participante',
  surveyor: 'Encuestador',
  moderator: 'Moderador',
};

export type PublicStatus = 'received' | 'in_process' | 'selected' | 'not_selected' | 'finished';

export interface ProspectState {
  key: string;
  label: string;
  /** Para qué sirve el estado, en una línea (ayuda en la interfaz). */
  help: string;
  public: PublicStatus;
  negative?: boolean;
  participated?: boolean;
}

export const PROSPECT_STATES: ProspectState[] = [
  { key: 'nuevo', label: 'Nuevo', help: 'Se registró o lo agregó el equipo; nadie lo ha revisado.', public: 'received' },
  { key: 'en_contacto', label: 'En contacto', help: 'El equipo ya habló con la persona.', public: 'in_process' },
  { key: 'en_evaluacion', label: 'En evaluación', help: 'Filtro, entrevista, capacitación o prueba.', public: 'in_process' },
  { key: 'en_espera', label: 'En lista de espera', help: 'Cumple, pero por ahora no hay cupo.', public: 'in_process' },
  { key: 'seleccionado', label: 'Seleccionado', help: 'Confirmado o asignado para participar.', public: 'selected' },
  { key: 'participo', label: 'Participó', help: 'Asistió o completó su trabajo. Califícalo.', public: 'finished', participated: true },
  { key: 'no_seleccionado', label: 'No seleccionado', help: 'No cumple o no se eligió.', public: 'not_selected', negative: true },
  { key: 'no_participo', label: 'No participó', help: 'No asistió, canceló, abandonó o se anuló.', public: 'finished', negative: true },
];

/** Estado con que entra toda persona (por la landing o agregada por el equipo). */
export const INITIAL_STATUS = 'nuevo';

export const ALL_STATUSES = new Set(PROSPECT_STATES.map((s) => s.key));

export const PARTICIPATED_STATUSES = PROSPECT_STATES.filter((s) => s.participated).map((s) => s.key);

export function isRole(v: unknown): v is ProspectRole {
  return typeof v === 'string' && (PROSPECT_ROLES as readonly string[]).includes(v);
}

export function stateOf(status: string): ProspectState | undefined {
  return PROSPECT_STATES.find((s) => s.key === status);
}

/** Lo que ve la persona; un estado desconocido se muestra como «recibido». */
export function publicStatusOf(status: string): PublicStatus {
  return stateOf(status)?.public ?? 'received';
}
