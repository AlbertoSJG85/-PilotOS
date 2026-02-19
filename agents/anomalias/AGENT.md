# Anomalías – Sistema de Anomalías Acumulativas

## Identidad

Las anomalías son desviaciones del comportamiento esperado que el sistema
registra y acumula para seguimiento y auditoría.

---

## Tipos de Anomalías

| Tipo | Descripción | Aviso |
|------|-------------|-------|
| Normal | Desviación menor | Cada 3 acumuladas |
| Crítica | Desviación grave | Inmediato |

---

## Reglas de Anomalías

| ID | Regla |
|----|-------|
| R-AN-001 | Las anomalías se **acumulan** |
| R-AN-002 | Las anomalías **NUNCA** se resetean |
| R-AN-003 | Cada 3 anomalías acumuladas → GlorIA avisa al patrón |
| R-AN-004 | Las anomalías críticas → GlorIA avisa al patrón **inmediatamente** |
| R-AN-005 | El tiempo NO importa: 3 anomalías en 3 días o en 2 meses es exactamente lo mismo |

---

## Ejemplos de Anomalías Normales

- Foto ilegible
- Discrepancia menor en km
- Ingreso fuera de rango habitual

---

## Ejemplos de Anomalías Críticas

- Más de 2 intentos de foto fallidos
- Ticket perdido
- Incidencia sin resolver por tiempo prolongado

---

## Estados de Anomalía

| ID | Estado | Descripción |
|----|--------|-------------|
| S-AN-001 | Registrada | Anomalía documentada en el sistema |
| S-AN-002 | Notificada | Patrón ha sido avisado |

---

## Eventos de Anomalía

| ID | Evento | Condición |
|----|--------|-----------|
| E-AN-001 | Anomalía registrada | Sistema detecta desviación |
| E-AN-002 | Umbral alcanzado | 3 anomalías acumuladas |
| E-AN-003 | Aviso enviado | GlorIA notifica al patrón |
| E-AN-004 | Aviso crítico enviado | Anomalía crítica detectada |

---

Este documento es canónico.
Nada fuera de aquí se asume.
