# PilotOS – Estados del Sistema

Este documento contiene los ESTADOS del sistema PilotOS.
Fuente: Documentación canónica.

---

## Parte Diario

| ID | Estado | Descripción |
|----|--------|-------------|
| S-PD-001 | Borrador | Parte Diario en proceso de completar (implícito: antes de envío) |
| S-PD-002 | Enviado | Parte Diario enviado exitosamente (inmutable) |
| S-PD-003 | Foto sustituida | Parte Diario donde una foto ilegible fue reemplazada |

→ Detalle completo en: `agents/parte-diario/AGENT.md`

---

## Fotos

| ID | Estado | Descripción |
|----|--------|-------------|
| S-FT-001 | Válida | Foto correcta aceptada por el sistema |
| S-FT-002 | Ilegible | Foto rechazada por calidad insuficiente |
| S-FT-003 | Reemplazada | Foto sustituida por el usuario tras solicitud |
| S-FT-004 | Bloqueada | Foto no válida tras múltiples intentos |

→ Detalle completo en: `agents/fotos/AGENT.md`

---

## Anomalías

| ID | Estado | Descripción |
|----|--------|-------------|
| S-AN-001 | Registrada | Anomalía documentada en el sistema |
| S-AN-002 | Notificada | Patrón ha sido avisado |

→ Detalle completo en: `agents/anomalias/AGENT.md`

---

## Incidencias

| ID | Estado | Descripción |
|----|--------|-------------|
| S-IN-001 | Creada | Incidencia documentada |
| S-IN-002 | Cerrada | Incidencia resuelta/documentada |

→ Detalle completo en: `agents/incidencias/AGENT.md`

---

## Gastos

| ID | Estado | Descripción |
|----|--------|-------------|
| S-GA-001 | Recibido | Documento recibido por GlorIA |
| S-GA-002 | Clasificado | Tipo determinado |
| S-GA-003 | Pendiente confirmación | Esperando datos adicionales |
| S-GA-004 | Registrado | Gasto documentado en sistema |

→ Detalle completo en: `agents/gastos/AGENT.md`

---

## Mantenimientos

| ID | Estado | Descripción |
|----|--------|-------------|
| S-MT-001 | Pendiente | Próximo a vencer (km o fecha) |
| S-MT-002 | Vencido | Superado límite sin resolver |
| S-MT-003 | Resuelto | Factura recibida y procesada |

→ Detalle completo en: `agents/mantenimientos/AGENT.md`

---

## Estados Globales (Arquitectura)

| ID | Estado | Descripción |
|----|--------|-------------|
| S-SYS-001 | Lead | Fase comercial / pre-captación |
| S-SYS-002 | Onboarding | Fase de configuración inicial |
| S-SYS-003 | Ops | Fase operativa normal (PilotOS activo) |
| S-SYS-004 | Support | Fase de soporte técnico |

→ Detalle completo en: `docs/gloria-guia.txt`
