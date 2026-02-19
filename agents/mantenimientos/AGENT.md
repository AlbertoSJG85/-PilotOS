# Mantenimientos – Sistema de Mantenimientos de Vehículos

## Identidad

El sistema de mantenimientos gestiona el catálogo cerrado de mantenimientos
preventivos y correctivos para cada vehículo.

---

## Tipos de Mantenimiento

| Tipo | Frecuencia | Avisos |
|------|------------|--------|
| Por kilometraje | Cada X km | Automáticos |
| Por fecha | Según calendario | Automáticos |
| Según uso | Sin frecuencia | Solo cuando ocurre |

---

## Reglas Generales

| ID | Regla |
|----|-------|
| R-MT-001 | Los mantenimientos están PREDEFINIDOS en catálogo cerrado |
| R-MT-002 | Las frecuencias por defecto ya están definidas |
| R-MT-003 | El sistema puede aprender la frecuencia real por vehículo |
| R-MT-004 | Cuando entra una factura → se resuelve automáticamente |
| R-MT-005 | Si un mantenimiento nunca se usa → NO aparece en dashboard |
| R-MT-006 | NO se inventan mantenimientos adicionales |

---

## Catálogo: Por Kilometraje

⚠️ **DEFINITIVO – No modificar sin autorización**

| Mantenimiento | Frecuencia |
|---------------|-----------|
| Cambio de aceite y filtro | 12.000 km |
| Filtro de aire | 12.000 km |
| Filtro de combustible (gasolina) | 15.000 km |
| Filtro de combustible (diésel) | 50.000 km |
| Filtro de habitáculo / polen | 30.000 km |
| Aceite de transmisión automática | 40.000 km |
| Aceite de transmisión manual | 80.000 km |
| Transmisión automática (revisión) | 60.000 km |
| Correa de distribución | 90.000 km |
| Líquido refrigerante | 100.000 km |
| Líquido de frenos | 45.000 km |

---

## Catálogo: Según Uso

⚠️ **Sin frecuencia – Se registran cuando ocurre el evento**

| Mantenimiento | Notas |
|---------------|-------|
| Pastillas de freno | Por desgaste |
| Discos de freno | Por desgaste |
| Neumáticos | Por desgaste |
| Embrague | Por desgaste |
| Batería 12V | Por fallo/edad |
| Amortiguadores | Por desgaste |

---

## Catálogo: Por Fecha / Obligaciones

⚠️ **Deben existir aunque estén vacíos**

| Mantenimiento | Tipo |
|---------------|------|
| Seguro del vehículo | Renovación anual |
| ITV del vehículo | Según matriculación |
| ITV / verificación del taxímetro | Periódica |
| Revisión sanitaria anual | Obligatoria |
| Impuestos trimestrales (IGIC/IRPF) | Trimestral |
| Presentación de renta anual | Anual |
| Inspecciones municipales | Según factura |

---

## Estados de Mantenimiento

| ID | Estado | Descripción |
|----|--------|-------------|
| S-MT-001 | Pendiente | Próximo a vencer (km o fecha) |
| S-MT-002 | Vencido | Superado límite sin resolver |
| S-MT-003 | Resuelto | Factura recibida y procesada |

---

## Eventos de Mantenimiento

| ID | Evento | Condición |
|----|--------|-----------|
| E-MT-001 | Mantenimiento próximo | Se acerca al umbral |
| E-MT-002 | Mantenimiento vencido | Superó umbral sin factura |
| E-MT-003 | Mantenimiento resuelto | Factura procesada |
| E-MT-004 | Frecuencia actualizada | Sistema aprendió nuevo patrón |

---

Este documento es canónico.
Nada fuera de aquí se asume.
