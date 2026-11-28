# Implementation Plan

## Overview

Implementación del nodo `http_request` según `requirements.md` y `design.md`: primero el backend, luego el editor.

## Tasks

- [x] 1. Módulo HTTP del backend
  - [x] 1.1 Crear `backend/src/conversation-flows/flow-http.util.ts` con `executeFlowHttp`, `applyMappings`, `isSensitiveHeader`, `MASKED_HEADER_VALUE` y las constantes del diseño. Agregar tipos `FlowHttpConfig`, `FlowHttpMapping` y `FlowHttpPair` y `'http_request'` en `conversation-flow.entity.ts`.
    - Reutilizar `safeFetch` y `getPath`.
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 2.1, 2.3, 2.4, 2.7, 2.8, 5.1, 5.2, 5.3, 5.8_
  - [x] 1.2 Pruebas `flow-http.util.spec.ts` con `fetcher` simulado, según la estrategia de pruebas del diseño.
    - _Requirements: 1.5, 2.3, 2.4, 2.7, 2.8, 5.2, 5.6_

- [x] 2. Motor y servicio del backend
  - [x] 2.1 Agregar `case 'http_request'` y `runHttp` en `conversation-flow.engine.ts`, con `httpMs` en `FlowRunResult`, `http_status`, `http_error`, mapeos, `saveToField` y presupuesto de 30 s por turno. Sin salida `error` conectada el flujo termina.
    - _Requirements: 2.2, 2.3, 2.5, 2.6, 3.2, 3.3, 3.4, 3.5, 5.6, 6.3_
  - [x] 2.2 En `conversation-flows.service.ts`: `NODE_TYPES`, `isValidHandle` (`next`, `error`), `sanitizeHttp`, máscara de encabezados sensibles al leer y conservación del valor guardado al escribir.
    - _Requirements: 1.6, 1.7, 5.5, 6.2_
  - [x] 2.3 Agregar `POST conversation-flows/http-test` con `HttpTestDto`, `testHttp` y `@Throttle` de 20 por minuto, antes de las rutas `:id`.
    - _Requirements: 4.1, 4.2, 4.3, 4.7, 4.8, 5.4, 5.7_
  - [x] 2.4 Pruebas `flow-http-node.spec.ts` (motor) y pruebas del servicio y del endpoint de prueba según el diseño. Ejecutar toda la suite de `conversation-flows` para confirmar que los flujos sin el nodo no cambian.
    - _Requirements: 2.3, 3.2, 3.3, 3.5, 5.5, 6.1_

- [x] 3. Editor del frontend
  - [x] 3.1 Agregar tipos en `types.ts` y crear `http.ts` (`defaultHttpConfig`, `httpIssue`, `httpVariables`, `extractPlaceholders`, `suggestVariableName`, `getPath`).
    - _Requirements: 1.1, 3.6_
  - [x] 3.2 Crear `JsonTree.tsx` y `HttpEditor.tsx` con las secciones Petición, Probar (con `ConfirmModal` para métodos distintos de GET) y Guardar respuesta, y encabezados sensibles ocultos con valor "guardado".
    - _Requirements: 1.2, 1.3, 1.4, 1.6, 1.7, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9_
  - [x] 3.3 Crear `HttpNode` en `FlowNodes.tsx`, registrarlo en `nodeTypes.ts`, y en `FlujoEditor.tsx` agregarlo a la paleta ("Petición API", después de "Generación IA"), con datos por defecto, salidas `next` y `error`, y variables disponibles (`http_status`, `http_error` y las mapeadas). Conectar `HttpEditor` en `NodeInspector.tsx`.
    - _Requirements: 2.2, 3.1, 3.6, 6.3_
  - [x] 3.4 Ejecutar `tsc` y lint del frontend y corregir los errores.
    - _Requirements: 6.1_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "2.2", "3.1"] },
    { "id": 2, "tasks": ["2.3", "3.2"] },
    { "id": 3, "tasks": ["2.4", "3.3"] },
    { "id": 4, "tasks": ["3.4"] }
  ]
}
```

## Notes

- El backend debe desplegarse antes que el frontend: un flujo guardado con el nodo nuevo falla en servidores que no lo reconocen.
- No se versiona `backend/.env.example`: tiene credenciales reales.
