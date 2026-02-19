# Fotos – Gestión de Fotos, Reemplazos y Bloqueos

## Identidad

El sistema de fotos gestiona la validación de imágenes adjuntas al Parte Diario
y controla los bloqueos por tareas pendientes.

---

## Reglas de Fotos Ilegibles

| ID | Regla |
|----|-------|
| R-FT-001 | Si una foto es ilegible, se crea una tarea pendiente de corrección |
| R-FT-002 | GlorIA envía un enlace para re-subir SOLO esa foto |

---

## Reglas de Reemplazo

| ID | Regla |
|----|-------|
| R-FT-003 | Máximo 2 reemplazos por foto |
| R-FT-004 | Se conserva el histórico de TODAS las fotos (originales + reemplazos) |
| R-FT-005 | A partir del tercer intento, se bloquea la foto y se genera anomalía |

---

## Reglas de Bloqueo

| ID | Regla |
|----|-------|
| R-FT-006 | Si hay una tarea pendiente, el conductor NO puede subir el siguiente Parte |
| R-FT-007 | GlorIA recuerda el bloqueo cuando el conductor intenta subir un nuevo Parte |

---

## Flujo: Conductor sin Ticket

Si el conductor ya no tiene el ticket físico:

| Paso | Acción |
|------|--------|
| 1 | Se genera una anomalía |
| 2 | GlorIA informa al patrón |
| 3 | GlorIA adjunta la foto ilegible al mensaje del patrón |
| 4 | Queda constancia documental |

---

## Estados de Foto

| ID | Estado | Descripción |
|----|--------|-------------|
| S-FT-001 | Válida | Foto aceptada por el sistema |
| S-FT-002 | Ilegible | Foto marcada como ilegible, pendiente de reemplazo |
| S-FT-003 | Reemplazada | Foto sustituida correctamente |
| S-FT-004 | Bloqueada | Más de 2 intentos fallidos |

---

## Eventos de Foto

| ID | Evento | Condición |
|----|--------|-----------|
| E-FT-001 | Foto marcada ilegible | Sistema o patrón determina que no es legible |
| E-FT-002 | Enlace de reemplazo enviado | GlorIA envía enlace al conductor |
| E-FT-003 | Foto reemplazada | Conductor sube nueva foto válida |
| E-FT-004 | Foto bloqueada | Tercer intento fallido |
| E-FT-005 | Anomalía por ticket perdido | Conductor sin ticket físico |

---

Este documento es canónico.
Nada fuera de aquí se asume.
