# Dashboard – Panel de Lectura

## Identidad

El dashboard es una interfaz web de **SOLO LECTURA** para visualizar
el estado del sistema PilotOS.

---

## Acceso por Rol

| Rol | Acceso |
|-----|--------|
| Conductor | ❌ NO tiene dashboard |
| Patrón | ✅ Acceso completo de lectura |

---

## Información Visible (Patrón)

| Sección | Contenido |
|---------|-----------|
| Ingresos | Historial de partes diarios |
| Gastos | Facturas y pagos registrados |
| Anomalías | Listado con contador |
| Incidencias | Historial de incidencias |
| Mantenimientos | Solo los relevantes (usados) |
| Impuestos | Registros de IGIC, IRPF, etc. |

---

## Reglas del Dashboard

| ID | Regla |
|----|-------|
| R-DB-001 | El dashboard es SOLO LECTURA |
| R-DB-002 | El conductor NO tiene acceso al dashboard |
| R-DB-003 | Si no hay datos, no se muestra nada |
| R-DB-004 | Los mantenimientos no usados NO aparecen |

---

Este documento es canónico.
Nada fuera de aquí se asume.
