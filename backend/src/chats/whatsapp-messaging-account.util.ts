/**
 * Cuenta de mensajes (Messaging account) de WhatsApp.
 *
 * Con el nuevo modelo de cuentas de Meta, un mismo número puede estar vinculado
 * a varias cuentas de mensajes. Si el token tiene acceso a más de una, cada
 * envío a `/{phone_number_id}/messages` debe indicar `messaging_account_id`;
 * si no, Meta la elige de forma ambigua y el envío puede fallar (p. ej. 131070
 * "another app is controlling this thread") o facturarse a otra cuenta.
 *
 * Solo se añade cuando el inbox la tiene configurada, para no alterar los
 * envíos de los números que tienen una única cuenta de mensajes.
 *
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/account-model-evolution/messaging
 */
export function withMessagingAccount<T extends Record<string, any>>(
  body: T,
  messagingAccountId: string | null | undefined,
): T {
  const id = messagingAccountId?.trim();
  if (!id) return body;
  return { ...body, messaging_account_id: id };
}
