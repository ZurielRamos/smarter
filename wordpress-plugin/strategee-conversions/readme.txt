=== Strategee Conversions ===
Contributors: strategee
Tags: conversions, woocommerce, tracking, crm, sms, whatsapp
Requires at least: 5.8
Tested up to: 6.5
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Envía eventos de conversión de WooCommerce y formularios a la API de Strategee para medir el ROI de campañas SMS y WhatsApp.

== Description ==

Strategee Conversions conecta tu tienda WooCommerce y formularios de contacto con la plataforma Strategee CRM, permitiéndote:

* Rastrear compras, carritos y checkouts como conversiones
* Enviar eventos de formularios (Contact Form 7, WPForms, Gravity Forms) como leads
* Medir el ROI real de tus campañas de SMS y WhatsApp
* Atribuir conversiones a campañas específicas

**Eventos soportados:**

* **Purchase** — Compra completada con valor y detalle de productos
* **Add to Cart** — Producto agregado al carrito
* **Initiate Checkout** — Inicio del proceso de pago
* **View Content** — Vista de página de producto
* **Lead** — Envío de formulario de contacto
* **Sign Up** — Registro de nuevo usuario

**Formularios soportados:**

* Contact Form 7
* WPForms
* Gravity Forms

== Installation ==

1. Sube la carpeta `strategee-conversions` a `/wp-content/plugins/`
2. Activa el plugin desde el panel de WordPress
3. Ve a Ajustes > Strategee Conversions
4. Ingresa la URL de tu API, el Token y el Slug de tu cuenta
5. Usa "Probar conexión" para verificar
6. Activa los eventos que deseas rastrear

== Frequently Asked Questions ==

= ¿Necesito WooCommerce? =

No es obligatorio. El plugin también funciona con formularios de contacto para rastrear leads.

= ¿Qué pasa si la API no responde? =

Los eventos se encolan automáticamente y se reintentan con backoff exponencial (hasta 5 intentos).

= ¿Es compatible con HPOS? =

Sí, el plugin declara compatibilidad con High-Performance Order Storage de WooCommerce.

== Changelog ==

= 1.0.0 =
* Versión inicial
* Integración con WooCommerce (purchase, add_to_cart, initiate_checkout, view_content)
* Integración con Contact Form 7, WPForms y Gravity Forms
* Cola de reintentos con backoff exponencial
* Panel de administración con logs y test de conexión
