# Requirements Document

Nodo "Petición API" en flujos de conversación

## Introduction

Los flujos de conversación (`conversation-flows`) tienen hoy los nodos Mensaje, Entrada, Acción, Condición, Conversación IA, Generación IA e Iniciar flujo. No hay forma de consultar un sistema externo durante una conversación y usar su respuesta en los nodos siguientes.

Este spec añade un nodo **Petición API** que llama a una API HTTP y guarda campos de la respuesta como variables del flujo. Los nodos posteriores (Mensaje, Condición, Acción, etc.) usan esas variables con el mismo mecanismo `{{variable}}` que ya existe.

Las automatizaciones ya tienen un nodo `http_request` (`automation-engine.service.ts`) con validación SSRF (`safeFetch`) y límites. Este spec reutiliza `safeFetch` y no usa las conexiones de Automatizaciones: el token se escribe directamente en un encabezado del nodo.

## Glossary

- **Flujo**: grafo de nodos y conexiones de `conversation_flows`.
- **Variable del flujo**: valor guardado durante la ejecución (`variables[nombre]`), disponible en nodos posteriores como `{{nombre}}`.
- **Petición API**: llamada HTTP saliente configurada en un nodo.
- **Mapeo de respuesta**: regla que toma un campo de la respuesta (por ruta) y lo guarda en una variable.
- **Prueba de petición**: ejecución manual del nodo desde el editor, con valores de ejemplo, para ver la respuesta real y elegir los campos a guardar.

## Requirements

### Requisito 1 — Configurar la petición

**Historia de usuario:** Como administrador de un flujo, quiero definir método, URL, encabezados y cuerpo de la petición, para consultar la API que necesito.

#### Criterios de aceptación

1. CUANDO se agrega un nodo Petición API ENTONCES el sistema DEBERÁ permitir elegir el método GET, POST, PUT, PATCH o DELETE.
2. CUANDO se escribe la URL, los parámetros de consulta, los encabezados o el cuerpo ENTONCES el sistema DEBERÁ permitir insertar variables del flujo y campos del contacto con `{`, que inserta `{{variable}}`, igual que en el nodo Mensaje.
3. CUANDO el método es GET ENTONCES el sistema DEBERÁ ocultar el cuerpo.
4. CUANDO el método no es GET ENTONCES el sistema DEBERÁ permitir cuerpo JSON, formulario o texto.
5. CUANDO el cuerpo es JSON válido ENTONCES el sistema DEBERÁ sustituir las variables por valor, de modo que un valor con comillas o saltos de línea no rompa el JSON.
6. CUANDO el usuario escribe el valor de un encabezado de autenticación (por ejemplo `Authorization`, `X-API-Key` o cualquier encabezado cuyo nombre contenga `token`, `key`, `secret` o `auth`) ENTONCES el sistema DEBERÁ mostrarlo oculto mientras lo escribe, con un control para revelarlo.
7. CUANDO el flujo ya está guardado ENTONCES el editor DEBERÁ mostrar ese valor como "guardado" sin revelarlo y permitir reemplazarlo, y conservar el valor guardado si el usuario no lo cambia.

### Requisito 2 — Guardar la respuesta en variables

**Historia de usuario:** Como administrador de un flujo, quiero elegir qué campos de la respuesta guardar, para usarlos en los nodos siguientes.

#### Criterios de aceptación

1. CUANDO la respuesta es JSON ENTONCES el sistema DEBERÁ permitir definir mapeos con una ruta (por ejemplo `data.items[0].nombre`) y un nombre de variable.
2. CUANDO la petición termina ENTONCES el sistema DEBERÁ guardar cada campo mapeado en `variables[nombre]` antes de pasar al siguiente nodo.
3. CUANDO la ruta de un mapeo no existe en la respuesta ENTONCES el sistema DEBERÁ eliminar esa variable, para que no conserve un valor de una ejecución anterior (mismo criterio que Generación IA).
4. CUANDO el valor de un campo es un objeto o una lista ENTONCES el sistema DEBERÁ guardarlo como texto JSON.
5. CUANDO la petición termina ENTONCES el sistema DEBERÁ guardar el código de estado en una variable con nombre fijo `http_status`, sin que el usuario la configure.
6. CUANDO un mapeo define un campo del contacto ENTONCES el sistema DEBERÁ guardar el valor también en ese campo, con la opción de no reemplazar un valor existente (igual que `saveToField` y `keepExisting` en otros nodos).
7. CUANDO el usuario usa la ruta `$` ENTONCES el sistema DEBERÁ guardar la respuesta completa (texto o JSON como texto) en la variable, lo que cubre las respuestas que no son JSON.
8. CUANDO un valor guardado supera 4000 caracteres ENTONCES el sistema DEBERÁ recortarlo a ese límite.

### Requisito 3 — Salidas y manejo de errores

**Historia de usuario:** Como administrador de un flujo, quiero decidir qué pasa si la API falla, para que la conversación no se quede bloqueada.

#### Criterios de aceptación

1. CUANDO el nodo tiene salidas ENTONCES el sistema DEBERÁ mostrar dos: "Éxito" y "Error".
2. CUANDO la API responde con estado 2xx ENTONCES el sistema DEBERÁ seguir por "Éxito".
3. CUANDO la API responde con otro estado, agota el tiempo de espera, no se puede conectar o la URL es rechazada ENTONCES el sistema DEBERÁ seguir por "Error".
4. CUANDO se sigue por "Error" ENTONCES el sistema DEBERÁ guardar `http_status` (0 si no hubo respuesta) y `http_error` con un mensaje corto.
5. CUANDO la salida "Error" no está conectada ENTONCES el sistema DEBERÁ terminar el turno sin romper la conversación y registrar el error en el historial de la ejecución.
6. CUANDO el flujo se guarda con el nodo sin URL o sin salida "Éxito" conectada ENTONCES el editor DEBERÁ marcarlo con una advertencia, como hace con "Mensaje vacío".

### Requisito 4 — Probar la petición y mapear la respuesta

**Historia de usuario:** Como administrador de un flujo, quiero probar la petición desde el editor y elegir los campos de la respuesta real, para usarlos en los nodos siguientes sin adivinar rutas.

#### Criterios de aceptación

1. CUANDO el usuario pulsa "Probar" ENTONCES el sistema DEBERÁ ejecutar la petición con la configuración actual del nodo, aunque el flujo tenga cambios sin guardar.
2. CUANDO la configuración usa variables o campos del contacto ENTONCES el sistema DEBERÁ pedir un valor de ejemplo para cada uno antes de ejecutar y recordar esos valores mientras el editor esté abierto.
3. CUANDO la prueba termina ENTONCES el sistema DEBERÁ mostrar el código de estado, el tiempo de respuesta y el cuerpo, en árbol navegable si es JSON.
4. CUANDO el usuario pulsa un campo del árbol ENTONCES el sistema DEBERÁ agregar un mapeo con la ruta de ese campo y proponer un nombre de variable a partir de la clave, que el usuario puede cambiar.
5. CUANDO existen mapeos ENTONCES el sistema DEBERÁ mostrar junto a cada uno el valor que tomaría con la última respuesta de prueba.
6. CUANDO el método no es GET ENTONCES el sistema DEBERÁ avisar antes de ejecutar la prueba de que la petición puede crear o modificar datos reales, y pedir confirmación con el componente `ConfirmModal`.
7. CUANDO la prueba falla ENTONCES el sistema DEBERÁ mostrar el motivo (estado, tiempo agotado, URL bloqueada) sin cerrar el panel.
8. CUANDO se ejecuta una prueba ENTONCES el sistema NO DEBERÁ modificar el flujo, la conversación ni los campos del contacto.
9. CUANDO se cierra el editor ENTONCES el sistema NO DEBERÁ conservar la respuesta de prueba, porque puede contener datos personales.

### Requisito 5 — Seguridad y límites

**Historia de usuario:** Como operador del sistema, quiero que el nodo no sirva para atacar la red interna ni filtrar secretos, para mantener la plataforma segura.

#### Criterios de aceptación

1. CUANDO se ejecuta una petición ENTONCES el sistema DEBERÁ usar `safeFetch` (bloqueo SSRF, sin seguir redirecciones, límite de tamaño de respuesta).
2. CUANDO el usuario configura un tiempo de espera ENTONCES el sistema DEBERÁ limitarlo a un máximo de 15 segundos, porque la conversación espera la respuesta. El valor por defecto es 10 segundos.
3. CUANDO se registra la petición ENTONCES el sistema DEBERÁ ocultar los valores de los encabezados de autenticación y no registrar el cuerpo completo de la respuesta.
4. CUANDO se llama al endpoint de prueba ENTONCES el sistema DEBERÁ exigir un usuario autenticado con permiso para editar flujos del tenant.
5. CUANDO el flujo se devuelve por la API (lectura, guardado o duplicado) ENTONCES el sistema NO DEBERÁ incluir el valor de los encabezados de autenticación, solo una marca de que existe.
6. CUANDO la suma del tiempo de todas las peticiones de un mismo turno supera 30 segundos ENTONCES el sistema DEBERÁ enviar las siguientes por la salida "Error" sin ejecutarlas, con `http_error` indicando el motivo.
7. CUANDO se llama al endpoint de prueba ENTONCES el sistema DEBERÁ limitar la frecuencia a 20 pruebas por minuto.
8. CUANDO el contenido del cliente se inserta en la URL ENTONCES el sistema DEBERÁ codificar el valor en la ruta y en los parámetros de consulta.

### Requisito 6 — Compatibilidad

**Historia de usuario:** Como operador, quiero que los flujos existentes sigan funcionando igual.

#### Criterios de aceptación

1. CUANDO un flujo no contiene nodos Petición API ENTONCES el motor DEBERÁ comportarse igual que hoy.
2. CUANDO se valida y guarda un flujo ENTONCES el sistema DEBERÁ aceptar el nuevo tipo `http_request` y sanear sus datos como hace con los demás tipos (`conversation-flows.service.ts`).
3. CUANDO el flujo se ejecuta ENTONCES las variables guardadas por el nodo DEBERÁN estar disponibles en Condición, Mensaje, Acción y en las instrucciones de Conversación IA.

## Decisiones tomadas

1. **Autenticación:** el token se escribe en un encabezado del nodo. No se usan las conexiones de Automatizaciones. El valor queda guardado en el JSON del flujo, por lo que solo los usuarios que editan flujos deben poder verlo.
2. **Reintentos:** no hay reintentos automáticos.
3. **Prueba en el editor:** incluida (Requisito 4).
