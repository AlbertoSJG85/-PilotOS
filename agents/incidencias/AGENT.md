# Incidencias – Sistema de Documentación de Errores

## Identidad

Las incidencias documentan errores humanos graves y las decisiones
tomadas para resolverlos, manteniendo trazabilidad legal.

---

## Concepto Clave

Las incidencias:
- ❌ **NO corrigen** datos
- ❌ **NO sustituyen** datos
- ✅ **AÑADEN** contexto legal y operativo

---

## Flujo Obligatorio de Creación

| Paso | Actor | Acción |
|------|-------|--------|
| 1 | Conductor | Detecta error y habla con el patrón |
| 2 | Patrón | Habla con GlorIA |
| 3 | GlorIA | Crea la incidencia |

> **Importante**: El conductor NUNCA puede crear ni modificar incidencias.

---

## Contenido de una Incidencia

| Campo | Descripción |
|-------|-------------|
| `que_ocurrio` | Descripción del error/problema |
| `decision_tomada` | Qué se decidió hacer |
| `justificacion` | Por qué se tomó esa decisión |
| `autorizador` | Quién autorizó (patrón) |
| `parte_referencia` | Referencia al último Parte válido |
| `fecha_creacion` | Timestamp de creación |

---

## Reglas de Incidencias

| ID | Regla |
|----|-------|
| R-IN-001 | Solo se crean a través de GlorIA |
| R-IN-002 | Solo el patrón puede autorizar su creación |
| R-IN-003 | Deben referenciar el Parte Diario afectado |
| R-IN-004 | Quedan almacenadas permanentemente para auditoría |
| R-IN-005 | No modifican el Parte Diario original |

---

## Ejemplo de Uso

**Escenario**: El conductor escribió 1000 km en lugar de 100 km.

1. El conductor **no puede** corregirlo directamente
2. El Parte **no se modifica**
3. El patrón habla con GlorIA
4. GlorIA crea incidencia documentando:
   - Qué ocurrió: "Error de dígito en km_fin"
   - Decisión: "Se considera km_fin = 100"
   - Justificación: "Basado en km promedio del vehículo"
   - Referencia: Parte del día X

---

## Estados de Incidencia

| ID | Estado | Descripción |
|----|--------|-------------|
| S-IN-001 | Creada | Incidencia documentada |
| S-IN-002 | Cerrada | Incidencia resuelta/documentada |

---

## Eventos de Incidencia

| ID | Evento | Condición |
|----|--------|-----------|
| E-IN-001 | Incidencia creada | Patrón solicita vía GlorIA |
| E-IN-002 | Incidencia cerrada | Documentación completada |

---

Este documento es canónico.
Nada fuera de aquí se asume.
