# Gastos – Facturas, Impuestos y Pagos

## Identidad

El sistema de gastos gestiona todo registro financiero que entra al sistema:
facturas, impuestos registros de seguros, autónomo y gestoría.

---

## Canal de Entrada

| ID | Regla |
|----|-------|
| R-GA-001 | Todo gasto entra por WhatsApp vía GlorIA |
| R-GA-002 | GlorIA detecta y clasifica automáticamente |

---

## Clasificación Automática

GlorIA clasifica cada entrada como:

| Tipo | Descripción |
|------|-------------|
| Gasto | Compra o servicio general |
| Mantenimiento | Factura de taller/mecánico |
| Impuesto | IGIC, IRPF, tasas |

---

## Regla de Pagos Fraccionables

| ID | Regla |
|----|-------|
| R-GA-003 | **SIEMPRE** se pregunta cómo se ha pagado |
| R-GA-004 | Incluso si la factura parece indicarlo |
| R-GA-005 | **SIEMPRE** se pide confirmación explícita |

---

## Casos Especiales

### Seguro

| ID | Regla |
|----|-------|
| R-GA-006 | Se pregunta periodicidad en onboarding |
| R-GA-007 | Se reconfirma con cada recibo |

### Autónomo

| ID | Regla |
|----|-------|
| R-GA-008 | Importe inicial se define en onboarding |
| R-GA-009 | Cambios solo vía GlorIA |

### Gestoría

| ID | Regla |
|----|-------|
| R-GA-010 | NO se pregunta en onboarding |
| R-GA-011 | Solo aparece si hay factura |

### Impuestos Trimestrales

| ID | Regla |
|----|-------|
| R-GA-012 | GlorIA reconoce IGIC, IRPF y similares |
| R-GA-013 | Se registran cuando se envía la factura/recibo |

---

## Estados de Gasto

| ID | Estado | Descripción |
|----|--------|-------------|
| S-GA-001 | Recibido | Documento recibido por GlorIA |
| S-GA-002 | Clasificado | Tipo determinado |
| S-GA-003 | Pendiente confirmación | Esperando datos adicionales |
| S-GA-004 | Registrado | Gasto documentado en sistema |

---

## Eventos de Gasto

| ID | Evento | Condición |
|----|--------|-----------|
| E-GA-001 | Documento recibido | Usuario envía archivo a GlorIA |
| E-GA-002 | Clasificación realizada | GlorIA determina tipo |
| E-GA-003 | Confirmación solicitada | Falta dato de pago |
| E-GA-004 | Gasto registrado | Todos los datos completos |

---

Este documento es canónico.
Nada fuera de aquí se asume.
