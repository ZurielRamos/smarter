# Eliminación de Datos de Usuario

> **Nota para desarrollo:** Este documento contiene el contenido para la página de Eliminación de Datos (Data Deletion). Meta requiere una URL de instrucciones o un callback URL para eliminación de datos. Este documento cubre el enfoque de "URL de instrucciones". Reemplaza `[NOMBRE_EMPRESA]`, `[NOMBRE_PLATAFORMA]`, `[EMAIL_CONTACTO]`, `[SITIO_WEB]` y `[FECHA_VIGENCIA]` con los valores reales antes de publicar.

---

## Contenido de la página

---

**Última actualización:** [FECHA_VIGENCIA]

## Eliminación de datos de usuario

En **[NOMBRE_PLATAFORMA]**, respetamos tu derecho a controlar tus datos personales. Si deseas eliminar la información que hemos recopilado a través de tu interacción con nuestra aplicación conectada a Facebook, puedes hacerlo de las siguientes maneras.

---

## Opción 1: Solicitud directa

Envía un correo electrónico a **[EMAIL_CONTACTO]** con el asunto "Solicitud de eliminación de datos" incluyendo:

- Tu nombre completo
- La dirección de email asociada a tu cuenta
- Tu identificador de Facebook (si lo conoces)
- Descripción de los datos que deseas eliminar

**Plazo de respuesta:** Procesaremos tu solicitud en un plazo máximo de **30 días hábiles** y te confirmaremos por correo electrónico cuando la eliminación se haya completado.

---

## Opción 2: Eliminar desde tu cuenta de Facebook

También puedes eliminar la conexión y los datos desde Facebook directamente:

1. Ve a la **Configuración de tu cuenta de Facebook**
2. Haz clic en **"Aplicaciones y sitios web"** (en la sección "Seguridad")
3. Busca **[NOMBRE_PLATAFORMA]** en la lista de aplicaciones activas
4. Haz clic en **"Eliminar"**
5. Confirma que deseas eliminar la actividad de la aplicación

Esto revocará nuestro acceso a tu información de Facebook y eliminará los datos almacenados asociados a tu perfil de Facebook.

---

## Opción 3: Formulario de eliminación

Puedes completar nuestro formulario de eliminación de datos en:

**[SITIO_WEB]/eliminacion-de-datos**

---

## ¿Qué datos eliminamos?

Al procesar tu solicitud de eliminación, eliminamos:

| Dato | Descripción |
|------|-------------|
| Perfil | Nombre, email y datos de identificación vinculados a tu cuenta de Facebook |
| Conversaciones | Historial de mensajes intercambiados con bots o agentes a través de Messenger/Instagram |
| Datos recopilados | Información que proporcionaste durante conversaciones (teléfono, preferencias, etc.) |
| Registros de actividad | Logs de interacción con la plataforma |

---

## ¿Qué datos podemos retener?

En ciertos casos, podemos retener información mínima según lo requerido por ley:

- **Registros legales:** Datos estrictamente necesarios para cumplir con obligaciones legales vigentes o resolver disputas pendientes

Estos datos serán eliminados una vez expire el periodo de retención legal aplicable. No se utilizarán para ningún otro propósito.

---

## Confirmación de eliminación

Una vez completada la eliminación:

- Recibirás una confirmación por correo electrónico
- Tus datos ya no serán procesados por nuestra plataforma
- La eliminación es **permanente e irreversible**

---

## Estado de tu solicitud

Si deseas consultar el estado de una solicitud de eliminación previamente enviada, contacta a **[EMAIL_CONTACTO]** indicando la fecha de tu solicitud original.

---

## Contacto

Si tienes preguntas sobre la eliminación de tus datos:

- **Email:** smarter@strategee.us
- **Sitio web:** [SITIO_WEB]

---

**[NOMBRE_EMPRESA]** — Todos los derechos reservados.

---

## Nota técnica: Data Deletion Callback (opcional)

> **Para el equipo de desarrollo:** Si en lugar de una página de instrucciones prefieres implementar un callback de eliminación automática (opción avanzada en la configuración de la app de Meta), el backend debe exponer un endpoint que:
>
> 1. Reciba un `POST` con un `signed_request` de Facebook
> 2. Decodifique el `signed_request` para obtener el `user_id`
> 3. Elimine los datos asociados a ese `user_id`
> 4. Responda con un JSON:
>
> ```json
> {
>   "url": "https://[SITIO_WEB]/eliminacion-estado?id=<tracking_id>",
>   "confirmation_code": "<tracking_id>"
> }
> ```
>
> Donde `url` es una página donde el usuario puede verificar el estado de la eliminación.
>
> **Ejemplo de implementación (NestJS):**
>
> ```typescript
> @Post('facebook/data-deletion')
> async handleDataDeletion(@Body('signed_request') signedRequest: string) {
>   const data = this.decodeSignedRequest(signedRequest);
>   const userId = data.user_id;
>   
>   // Eliminar datos del usuario
>   await this.userService.deleteByFacebookId(userId);
>   
>   const confirmationCode = randomUUID();
>   
>   return {
>     url: `https://[SITIO_WEB]/eliminacion-estado?id=${confirmationCode}`,
>     confirmation_code: confirmationCode,
>   };
> }
> ```
