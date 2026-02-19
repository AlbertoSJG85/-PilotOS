# PilotOS – Eventos del Sistema

Este documento contiene los EVENTOS del sistema PilotOS.
Fuente: Documentación canónica.

---

## Parte Diario

| ID | Evento |
|----|--------|
| E-PD-001 | Parte enviado |
| E-PD-002 - E-PD-006 | Envío bloqueado (distintas causas) |
| E-PD-007 | Foto sustituida |

→ Detalle completo en: `agents/parte-diario/AGENT.md`

---

## Fotos

| ID | Evento |
|----|--------|
| E-FT-001 | Foto marcada ilegible |
| E-FT-002 | Enlace de reemplazo enviado |
| E-FT-003 | Foto reemplazada |
| E-FT-004 | Foto bloqueada |
| E-FT-005 | Anomalía por ticket perdido |

→ Detalle completo en: `agents/fotos/AGENT.md`

---

## Anomalías

| ID | Evento | Condición |
|----|--------|-----------|
| E-AN-001 | Anomalía registrada | Sistema detecta desviación |
| E-AN-002 | Umbral alcanzado | 3 anomalías acumuladas |
| E-AN-003 | Aviso enviado | GlorIA notifica al patrón |
| E-AN-004 | Aviso crítico enviado | Anomalía crítica detectada |

→ Detalle completo en: `agents/anomalias/AGENT.md`

---

## Incidencias

| ID | Evento | Condición |
|----|--------|-----------|
| E-IN-001 | Incidencia creada | Patrón solicita vía GlorIA |
| E-IN-002 | Incidencia cerrada | Documentación completada |

→ Detalle completo en: `agents/incidencias/AGENT.md`

---

## Gastos

| ID | Evento | Condición |
|----|--------|-----------|
| E-GA-001 | Documento recibido | Usuario envía archivo a GlorIA |
| E-GA-002 | Clasificación realizada | GlorIA determina tipo |
| E-GA-003 | Confirmación solicitada | Falta dato de pago |
| E-GA-004 | Gasto registrado | Todos los datos completos |

→ Detalle completo en: `agents/gastos/AGENT.md`

---

## Mantenimientos

| ID | Evento | Condición |
|----|--------|-----------|
| E-MT-001 | Mantenimiento próximo | Se acerca al umbral |
| E-MT-002 | Mantenimiento vencido | Superó umbral sin factura |
| E-MT-003 | Mantenimiento resuelto | Factura procesada |
| E-MT-004 | Frecuencia actualizada | Sistema aprendió nuevo patrón |

→ Detalle completo en: `agents/mantenimientos/AGENT.md`

---

## Estados Globales (Arquitectura)

Fuente: `docs/Nex Os — Guía Operativa Base (agente Glor Ia).txt`

| ID | Evento | Condición |
|----|--------|-----------|
| E-SYS-001 | Mensaje Inbound | WhatsApp entrante a GlorIA |
| E-SYS-002 | Evento Scheduler | Trigger temporal (cron) |
| E-SYS-003 | Error de sistema | Fallo en workflow (Observability) |

