# PilotOS – Reglas del Sistema

Este documento contiene las REGLAS inmutables del sistema PilotOS.
Fuente: Documentación canónica.

---

## Parte Diario

| ID | Regla |
|----|-------|
| R-PD-001 | Entrada ÚNICAMENTE mediante app web nativa, móvil-first |
| R-PD-002 | Única parte del sistema que NO entra por WhatsApp |
| R-PD-003 - R-PD-009 | Campos obligatorios: fecha, vehículo, km_inicio, km_fin, ingreso_total, ingreso_datáfono, foto_taxímetro |
| R-PD-010 - R-PD-011 | Campos condicionales: combustible opcional, foto gasoil si combustible > 0 |
| R-PD-012 - R-PD-016 | Validaciones bloqueantes |
| R-PD-017 - R-PD-019 | Inmutabilidad del parte |
| R-PD-020 - R-PD-022 | Correcciones solo vía incidencias |

→ Detalle completo en: `agents/parte-diario/AGENT.md`

---

## GlorIA

| ID | Regla |
|----|-------|
| R-GL-001 | Único punto de entrada humano (excepto Parte Diario) |
| R-GL-002 - R-GL-006 | Comportamiento operativo: no conversa, opera |

→ Detalle completo en: `agents/gloria/AGENT.md`

---

## Fotos

| ID | Regla |
|----|-------|
| R-FT-001 - R-FT-007 | Reemplazos, bloqueos e histórico |

→ Detalle completo en: `agents/fotos/AGENT.md`

---

## Anomalías

→ Detalle completo en: `agents/anomalias/AGENT.md`

| ID | Regla |
|----|-------|
| R-AN-001 | Las anomalías se **acumulan** |
| R-AN-002 | Las anomalías **NUNCA** se resetean |
| R-AN-003 | Cada 3 anomalías acumuladas → GlorIA avisa al patrón |
| R-AN-004 | Las anomalías críticas → GlorIA avisa al patrón **inmediatamente** |
| R-AN-005 | El tiempo NO importa: 3 anomalías en 3 días o en 2 meses es exactamente lo mismo |

---

## Incidencias



→ Detalle completo en: `agents/incidencias/AGENT.md`

| ID | Regla |
|----|-------|
| R-IN-001 | Solo se crean a través de GlorIA |
| R-IN-002 | Solo el patrón puede autorizar su creación |
| R-IN-003 | Deben referenciar el Parte Diario afectado |
| R-IN-004 | Quedan almacenadas permanentemente para auditoría |
| R-IN-005 | No modifican el Parte Diario original |

---

## Gastos

→ Detalle completo en: `agents/gastos/AGENT.md`

| ID | Regla |
|----|-------|
| R-GA-001 | Todo gasto entra por WhatsApp vía GlorIA |
| R-GA-002 | GlorIA detecta y clasifica automáticamente |
| R-GA-003 | **SIEMPRE** se pregunta cómo se ha pagado |
| R-GA-004 | Incluso si la factura parece indicarlo |
| R-GA-005 | **SIEMPRE** se pide confirmación explícita |
| R-GA-006 | Seguro: Se pregunta periodicidad en onboarding |
| R-GA-007 | Seguro: Se reconfirma con cada recibo |
| R-GA-008 | Autónomo: Importe inicial se define en onboarding |
| R-GA-009 | Autónomo: Cambios solo vía GlorIA |
| R-GA-010 | Gestoría: NO se pregunta en onboarding |
| R-GA-011 | Gestoría: Solo aparece si hay factura |
| R-GA-012 | GlorIA reconoce IGIC, IRPF y similares |
| R-GA-013 | Se registran cuando se envía la factura/recibo |

---

## Mantenimientos

→ Detalle completo en: `agents/mantenimientos/AGENT.md`

| ID | Regla |
|----|-------|
| R-MT-001 | Los mantenimientos están PREDEFINIDOS en catálogo cerrado |
| R-MT-002 | Las frecuencias por defecto ya están definidas (ver catálogos) |
| R-MT-003 | El sistema puede aprender la frecuencia real por vehículo |
| R-MT-004 | Cuando entra una factura → se resuelve automáticamente |
| R-MT-005 | Si un mantenimiento nunca se usa → NO aparece en dashboard |
| R-MT-006 | NO se inventan mantenimientos adicionales |

### Catálogo: Por Kilometraje

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

### Catálogo: Según Uso

| Mantenimiento | Notas |
|---------------|-------|
| Pastillas de freno | Por desgaste |
| Discos de freno | Por desgaste |
| Neumáticos | Por desgaste |
| Embrague | Por desgaste |
| Batería 12V | Por fallo/edad |
| Amortiguadores | Por desgaste |

### Catálogo: Por Fecha / Obligaciones

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

## Dashboard

→ Detalle completo en: `agents/dashboard/AGENT.md`

| ID | Regla |
|----|-------|
| R-DB-001 | El dashboard es SOLO LECTURA |
| R-DB-002 | El conductor NO tiene acceso al dashboard |
| R-DB-003 | Si no hay datos, no se muestra nada |
| R-DB-004 | Los mantenimientos no usados NO aparecen |

---

## Estados Globales (Arquitectura)

Fuente: `docs/Nex Os — Guía Operativa Base (agente Glor Ia).txt`

| ID | Regla |
|----|-------|
| R-SYS-001 | **Agente único visible**: GlorIA (los subagentes son invisibles) |
| R-SYS-002 | **WhatsApp es canal**, nunca lógica |
| R-SYS-003 | **Event-driven**: Todo funciona por eventos reales con `event_id` |
| R-SYS-004 | **Idempotencia**: Cada acción debe tener `idempotency_key` |
| R-SYS-005 | GlorIA decide y mantiene `active_planet` y `phase` |
| R-SYS-006 | **Router**: Mantiene contexto salvo cambio explícito ("Un cerebro, muchos planetas") |
