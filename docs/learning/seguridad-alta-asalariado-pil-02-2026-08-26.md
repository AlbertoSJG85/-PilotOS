# PIL-02 — Dar de alta a un asalariado ya no puede secuestrar la cuenta de otro

**Fecha:** 2026-08-26
**Área afectada:** PilotOS · alta de conductores (`POST /api/usuarios`)
**Hallazgo:** PIL-02 (`NEXOS_SECURITY_AUDIT.md`)
**Fase del roadmap:** Fase 2 de `docs/roadmap-seguridad-escalabilidad-2026-08-25.md`

## Problema detectado

El alta de un asalariado hacía esto:

```ts
const user = await tx.minosUser.upsert({
  where:  { email: asalaEmail },
  update: { nombre: nombre || undefined, telefono },   // ← aquí
  create: { ... },
});
```

`minos."Users"` no es la tabla de usuarios de PilotOS: es la tabla de identidad
**compartida de todo el ecosistema**. La misma fila sirve a RentOS, a IngresOS y
a PilotOS.

Consecuencia: un patrón que escribiera en el formulario el email de **cualquier
usuario ya existente** —un gestor de RentOS, un autónomo de IngresOS, el patrón
de otro taxi— le **sobrescribía el teléfono** con el que él quisiera, y a
continuación lo daba de alta como conductor de su propia flota.

La víctima entra por teléfono. Al cambiárselo, **pierde el acceso a su cuenta**
sin haber hecho nada, sin recibir aviso y sin manera de entender por qué. Y
queda enganchada como conductor de una empresa con la que no tiene relación.

## Causa

`upsert` es cómodo: resuelve "créalo si no está, actualízalo si está" en una
línea. Pero la pregunta que nadie hizo es **de quién es la fila que se está
actualizando**. En una tabla por producto, un upsert por email es inofensivo. En
una tabla de identidad compartida, es un "escribe sobre la cuenta de quien
tenga ese email".

Es el mismo error de RNT-01, con otra sintaxis y en otro producto: **tratar un
identificador que otro ya usa como si estuviera libre**.

## Solución aplicada

Se comprueba antes de escribir, y **nunca se modifican los datos de una cuenta
que ya existe**:

- **No existe** → se crea. Es el caso normal.
- **Existe y ya conduce para otro cliente** → `409 conductor_de_otro_cliente`.
- **Existe y ya conduce para este cliente** → `409 ya_es_conductor` (el alta
  duplicada deja de crear una segunda ficha).
- **Existe, no conduce para nadie, y el teléfono coincide** → se le engancha
  como conductor **sin tocar su fila de identidad**. Ni nombre ni teléfono: son
  suyos, no del patrón que le da de alta.
- **Existe, no conduce para nadie, pero el teléfono NO coincide** → `409
  telefono_no_coincide`. Es exactamente el vector del hallazgo, y ahora se
  detiene con un mensaje que el patrón entiende.

El email se normaliza (`trim` + minúsculas) antes de buscar, para que
`Juan@X.com` y `juan@x.com` no creen cuentas gemelas.

Los conflictos viajan como `ConflictoAlta` y se traducen a `409` con motivo, en
vez del `500` mudo que salía antes.

## Evidencia

- `tsc --noEmit` limpio.
- 9 pruebas nuevas en `tests/smoke.altaAsalariado.test.ts`, incluido **el vector
  original** (usar el email de otro no le cambia el teléfono ni crea el
  conductor), que no queda ningún `upsert` en el alta, los tres conflictos con
  su código, la normalización del email, y **dos controles positivos**: un
  asalariado nuevo se da de alta con normalidad, y alguien del ecosistema que
  aún no conduce sí se engancha —comprobando explícitamente que su fila de
  identidad no se toca—.
- Suite completa: **304 pasan**. El único fallo restante es
  `smoke.ocrImagenReal`, flakiness de tesseract bajo carga: pasa en aislamiento
  y falla igual en el árbol limpio.

## Una corrección sobre PIL-01

Al ejecutar la suite completa aparecieron dos fallos y en PIL-01 se dijo que
ambos eran «previos y ajenos». **Solo lo era uno.** El otro
(`smoke.recuperarPassword > pedir un código nuevo invalida los anteriores`) era
una regresión de PIL-01: al acotar la invalidación por `proposito`, la aserción
existente dejó de coincidir.

El error de método fue **contar los fallos del árbol limpio (2) y dar por hecho
que eran los mismos, sin comparar los nombres**. Ya está corregido, y la prueba
ahora verifica el invariante nuevo. Queda anotado también en el documento de
PIL-01.

## Riesgos residuales

- **No desplegado.**
- **Cuentas ya contaminadas.** Si algún alta anterior sobrescribió el teléfono
  de un usuario existente, ese daño **ya está en la base de datos** y este
  cambio no lo deshace. Conviene una consulta de comprobación antes de
  desplegar: usuarios de `minos."Users"` que sean conductores de un cliente y
  cuyo email no sea `@pilotos.app`, revisando que el teléfono sea el suyo.
- El teléfono se compara literal. Dos formatos del mismo número (`+34600…` y
  `34600…`) darían `telefono_no_coincide` y bloquearían un alta legítima. Es
  fallar cerrado —preferible al contrario—, pero produce fricción; normalizar el
  teléfono como se hace con el email es una mejora pendiente.
- **La otra mitad de PIL-02 sigue abierta**: onboarding público sin verificación
  ni límite dedicado, y el JWT de 30 días sin revocación duplicado en
  `localStorage`. Es Fase 3.

## Prevención futura

- **`upsert` sobre una tabla compartida es una escritura sobre la cuenta de otro
  hasta que se demuestre lo contrario.** Antes de usarlo, preguntar de quién es
  la fila que se va a actualizar.
- **Un identificador que otro ya usa no está libre.** Misma lección que RNT-01.
- **Un alta nunca modifica los datos personales de una cuenta que ya existía.**
  Como mucho, la relaciona.
- **Contar fallos no es compararlos.** Dos suites con el mismo número de fallos
  pueden estar fallando por cosas distintas.

Documentos hermanos: [`seguridad-activacion-cuenta-pil-01-2026-08-26.md`](./seguridad-activacion-cuenta-pil-01-2026-08-26.md),
[`rentos-seguridad-onboarding-rnt-01-2026-08-25.md`](../../RentOS/nexos-api/docs/learning/rentos-seguridad-onboarding-rnt-01-2026-08-25.md).
