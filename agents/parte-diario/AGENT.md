# Parte Diario – Agente Núcleo de PilotOS

## Identidad

El Parte Diario es el **NÚCLEO ABSOLUTO** del sistema PilotOS.
Si el Parte Diario es sólido, todo lo demás funciona.

---

## Entrada

| ID | Regla |
|----|-------|
| R-PD-001 | Entrada ÚNICAMENTE mediante una app web nativa, móvil-first |
| R-PD-002 | Es la única parte del sistema que NO entra por WhatsApp |

---

## Campos Obligatorios

| Campo | Obligatorio |
|-------|-------------|
| `fecha_trabajada` | ✅ Siempre |
| `vehículo` | ✅ Siempre |
| `km_inicio` | ✅ Siempre |
| `km_fin` | ✅ Siempre |
| `ingreso_total` | ✅ Siempre |
| `ingreso_datáfono` | ✅ Siempre |
| `foto_ticket_taxímetro` | ✅ Siempre |

---

## Campos Condicionales

| Campo | Condición |
|-------|-----------|
| `combustible` | Opcional |
| `foto_ticket_gasoil` | Obligatoria si `combustible > 0` |

---

## Validaciones Duras (Bloqueantes)

| ID | Validación |
|----|------------|
| R-PD-012 | No se puede enviar si falta un campo obligatorio |
| R-PD-013 | `km_fin` debe ser estrictamente mayor que `km_inicio` |
| R-PD-014 | `ingreso_total` debe ser mayor o igual que `ingreso_datáfono` |
| R-PD-015 | Si `combustible > 0` → `foto_ticket_gasoil` es obligatoria |
| R-PD-016 | Solo puede existir un Parte Diario por vehículo y día |

---

## Inmutabilidad

| ID | Regla |
|----|-------|
| R-PD-017 | Una vez enviado, el Parte Diario NO se edita |
| R-PD-018 | No se pueden corregir kilómetros ni importes |
| R-PD-019 | Solo se permite la sustitución de fotos ilegibles bajo las reglas del sistema |

---

## Correcciones

| ID | Regla |
|----|-------|
| R-PD-020 | El conductor NO puede corregir datos |
| R-PD-021 | Los errores humanos graves se gestionan exclusivamente mediante Incidencias |
| R-PD-022 | El Parte Diario original NUNCA se modifica |

---

## Estados del Parte Diario

| ID | Estado | Descripción |
|----|--------|-------------|
| S-PD-001 | Borrador | Parte en proceso de completar (antes de envío) |
| S-PD-002 | Enviado | Parte enviado exitosamente (inmutable) |
| S-PD-003 | Foto sustituida | Parte donde una foto ilegible fue reemplazada |

---

## Eventos del Parte Diario

| ID | Evento | Condición |
|----|--------|-----------|
| E-PD-001 | Parte enviado | Todos los campos OK y validaciones cumplidas |
| E-PD-002 | Envío bloqueado | Falta campo obligatorio |
| E-PD-003 | Envío bloqueado | `km_fin` ≤ `km_inicio` |
| E-PD-004 | Envío bloqueado | `ingreso_total` < `ingreso_datáfono` |
| E-PD-005 | Envío bloqueado | `combustible > 0` sin foto gasoil |
| E-PD-006 | Envío bloqueado | Ya existe Parte para ese vehículo y día |
| E-PD-007 | Foto sustituida | Foto ilegible reemplazada |

---

Este documento es canónico.
Nada fuera de aquí se asume.
