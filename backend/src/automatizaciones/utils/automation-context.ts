import { AsyncLocalStorage } from 'async_hooks';

/**
 * Marca el contexto asíncrono de una ejecución de automatización. Los
 * subscribers de eventos del CRM lo consultan para ignorar los cambios que la
 * propia automatización provoca (p. ej. crear un contacto) y así evitar bucles.
 */
export const automationContext = new AsyncLocalStorage<{ automationId: string }>();
