# PIL-03 — Ahora se puede echar a alguien de verdad

**Fecha:** 2026-08-26
**Área afectada:** PilotOS · sesiones (backend y app)
**Hallazgo:** segunda mitad de PIL-02 (`NEXOS_SECURITY_AUDIT.md`)
**Fase del roadmap:** Fase 3 de `docs/roadmap-seguridad-escalabilidad-2026-08-25.md`

## Problema detectado

El JWT de PilotOS duraba **30 días** y **no había ninguna forma de
invalidarlo**. Ni una. Tres situaciones reales, y en las tres el sistema no
podía hacer nada:

- **Un móvil robado.** El ladrón abre la app y tiene hasta un mes de acceso a
  partes, documentos, km y economía.
- **Un conductor despedido.** Se le marca inactivo, desaparece de las listas…
  y sigue entrando con la app que ya tenía abierta, porque su token no
  dependía de estar activo.
- **Una contraseña cambiada por sospecha.** El intruso seguía dentro: su token
  no dependía de la contraseña. Cambiarla **no echaba a nadie**.

Encima, el token vivía a la vez en `localStorage` y en una cookie legible por
JavaScript, ambas con 30 días.

## Causa

La duración larga es una decisión de producto correcta: quien usa esto es un
taxista con la PWA en el móvil durante toda la jornada, y obligarle a entrar
cada día sería pelear con el producto. El comentario del código lo decía:
*"Sesión larga para uso real en móvil (PWA)"*.

El error no fue la duración. Fue **elegir una sesión larga sin construir a la
vez la forma de cortarla**. Un JWT es autocontenido: una vez firmado, el
servidor no vuelve a opinar. Si nadie añade un punto donde opinar, no lo hay.

## Solución aplicada

Un campo en el usuario: `sesiones_validas_desde`. **Todo JWT firmado antes de
ese instante deja de valer.**

Se compara contra el `iat` que ya lleva cada token, así que no hace falta
guardar una lista de tokens ni un registro por sesión. Y como `requireAuth` ya
releía al usuario de la base de datos, la comprobación **no cuesta ni una
consulta extra**.

El corte se dispara donde tiene que dispararse:

| Situación | Antes | Ahora |
|---|---|---|
| Cambiar la contraseña | el intruso sigue dentro | todas las sesiones cortadas |
| Restablecerla / activar cuenta | igual | todas las sesiones cortadas |
| Cerrar sesión | solo se borraba `localStorage` | el servidor corta todas |
| Desactivar a un conductor | seguía entrando hasta un mes | fuera en la siguiente petición |

Quien cambia su propia contraseña recibe una sesión nueva en la misma respuesta,
así que no se le echa de la aplicación por hacer lo correcto.

`JWT_EXPIRATION` baja de 30 a 7 días. Es el techo de lo que dura una sesión que
nadie revoca — pero **lo que arregla el problema es la revocación, no el
recorte**. La cookie pasa a durar lo mismo que el token (si sobreviviera, el
middleware dejaría pasar a páginas que la API luego rechaza, y el usuario vería
pantallas rotas en vez de un login) y lleva `secure` cuando la conexión es HTTPS.

## Evidencia

- `tsc --noEmit` limpio en backend y app.
- 8 pruebas nuevas en `tests/smoke.revocacionSesiones.test.ts`:
  - control positivo — sin revocación, un token válido pasa;
  - **el caso del despido y del móvil robado** — un token anterior al corte
    deja de valer aunque no haya caducado;
  - revocar no bloquea para siempre: un token posterior al corte sí vale;
  - un token emitido en el mismo segundo del corte **no se mata solo**
    (`iat` va en segundos y el corte en milisegundos: sin margen, la sesión
    recién creada se invalidaría al nacer);
  - la sesión nueva que se entrega tras revocar funciona de inmediato;
  - `revocarSesiones` mueve el corte a ahora y **no toca nada más**;
  - el token no dura más de 7 días.
- Suite completa: **312 pasan**. El único fallo es `smoke.ocrImagenReal`,
  flakiness de tesseract bajo carga — comprobado por **nombre**, no por número.

## Riesgos residuales

- **No desplegado.** Migración `20260826180000_revocacion_sesiones` pendiente.
  Es aditiva y nullable: al desplegar, nadie pierde su sesión.
- **El token sigue en `localStorage`.** Un XSS puede leerlo. La revocación
  limita el daño en el tiempo pero no lo impide; el arreglo real es cookie
  `HttpOnly` + refresh rotativo, y es trabajo de frontend considerable.
- **7 días siguen siendo mucho** para un token que nadie revoca. Bajarlo de
  verdad exige el refresh rotativo que no existe todavía.
- **La revocación es por usuario, no por dispositivo.** Cerrar sesión en el
  móvil echa también de la tablet. Para el caso de uso —un taxista con un
  dispositivo— es lo esperable, y además es lo que quiere quien cierra sesión en
  un móvil que ya no controla. Si algún día hay varios dispositivos por persona,
  hará falta granularidad.
- Un patrón puede cortar la sesión de un conductor desactivándolo, pero **no hay
  botón de "cerrar sesión de esta persona"** sin desactivarla.

## Prevención futura

- **Una sesión larga exige un botón de corte desde el primer día.** La duración
  no es el problema; la irreversibilidad sí.
- **Un JWT no vuelve a preguntar.** Si se usa, hay que añadir a propósito el
  punto donde el servidor puede cambiar de opinión.
- **Cambiar la contraseña tiene que echar a quien esté dentro.** Es lo que la
  gente cree que hace, y hasta hoy no lo hacía.
- **Desactivar significa "ahora", no "cuando caduque el token".**

Documentos hermanos: [`seguridad-alta-asalariado-pil-02-2026-08-26.md`](./seguridad-alta-asalariado-pil-02-2026-08-26.md),
[`seguridad-activacion-cuenta-pil-01-2026-08-26.md`](./seguridad-activacion-cuenta-pil-01-2026-08-26.md).
