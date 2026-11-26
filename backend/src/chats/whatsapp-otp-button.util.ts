/**
 * Plantillas de autenticación (OTP) de WhatsApp.
 *
 * Meta devuelve el botón "Copiar código" / autocompletar de una plantilla de
 * autenticación como un botón `URL` cuya URL contiene `otp_type=...&code=otp{{1}}`.
 * Al enviar la plantilla, Meta exige el componente del botón con el MISMO código
 * que va en el cuerpo; si falta, rechaza el envío con 131008
 * ("Required parameter is missing").
 *
 * https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates/copy-code-button-authentication-templates
 */

/** Índices de los botones OTP de la definición de la plantilla. */
function otpButtonIndexes(templateComponents: any[] | null | undefined): number[] {
  const buttons = (templateComponents || []).find(
    (c: any) => String(c?.type || '').toUpperCase() === 'BUTTONS',
  )?.buttons;
  if (!Array.isArray(buttons)) return [];
  const out: number[] = [];
  buttons.forEach((btn: any, idx: number) => {
    const type = String(btn?.type || '').toUpperCase();
    const url = String(btn?.url || '');
    if (type === 'OTP' || (type === 'URL' && url.includes('otp_type='))) out.push(idx);
  });
  return out;
}

/**
 * Devuelve los componentes de envío con el parámetro de cada botón OTP igual
 * al código del cuerpo (primer parámetro del componente `body`). Si ya había un
 * componente para ese botón, se sustituye su valor por el código (p. ej. cuando
 * se rellenó con la URL de ejemplo de la plantilla). Sin botones OTP o sin código
 * en el cuerpo, devuelve los componentes tal cual.
 */
export function withOtpButtonComponents(
  templateComponents: any[] | null | undefined,
  components: any[] | undefined,
): any[] | undefined {
  const indexes = otpButtonIndexes(templateComponents);
  if (!indexes.length) return components;
  const body = (components || []).find((c: any) => c?.type === 'body');
  const code = body?.parameters?.[0]?.text;
  if (!code || !String(code).trim()) return components;

  const result = [...(components || [])];
  for (const idx of indexes) {
    const button = {
      type: 'button',
      sub_type: 'url',
      index: String(idx),
      parameters: [{ type: 'text', text: String(code).trim() }],
    };
    const existing = result.findIndex(
      (c: any) => c?.type === 'button' && String(c?.index) === String(idx),
    );
    if (existing >= 0) result[existing] = button;
    else result.push(button);
  }
  return result;
}
