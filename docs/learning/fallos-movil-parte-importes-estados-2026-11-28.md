# Cuatro fallos visibles al recorrer la app en móvil

**Fecha:** 2026-11-28 · **Área:** frontend (partes, panel del conductor, informes)

Hallados recorriendo la app entera con una empresa ficticia en local (no con los tests).

| Problema | Causa | Solución | Prevención |
|---|---|---|---|
| El dueño no podía abrir un parte con el ticket ya leído o ilegible («Application error») | La pantalla solo conocía `PENDIENTE/PROCESADO/ERROR/MANUAL`; el backend escribe también `COMPLETADO` e `ILEGIBLE` y se leía `.color` de `undefined` | Añadidos los dos estados y un valor por defecto | Al pintar un código del backend, siempre con valor por defecto |
| «Ingresos generados: NaN €» en `/driver` | Los importes `Decimal` llegan como texto y se sumaban sin `Number()` | `Number()` antes de sumar | El tipo dice `number`, pero la API manda texto: convertir al sumar |
| Se veía `PENDIENTE_VALIDACION` | Cada pantalla pintaba el código interno | `lib/utils/estados.ts` → `etiquetaEstadoParte` en lista, detalle, panel y conductor | Usar esa función; no pintar `estado` en crudo |
| En Informes las cifras se salían por la derecha en móvil | Tarjetas de dos columnas con icono al lado del importe | En móvil el icono va encima y el importe es algo menor | Revisar a 390 px las pantallas con importes grandes |
| El gráfico «Día a día» del asalariado salía vacío | Barras con altura en % dentro de una columna sin altura | La columna ocupa todo el alto y la barra va en un hueco `flex-1` | Mirar los gráficos con datos, no solo que no den error |
| Mantenimientos enseñaba `POR_FECHA`, `SEGUN_USO` | Código interno pintado en crudo | `etiquetaTipoMantenimiento` | La misma regla que los estados |
