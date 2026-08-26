# PIL-01 — Conocer un teléfono ya no basta para quedarse con una cuenta

**Fecha:** 2026-08-26
**Área afectada:** PilotOS · autenticación (activación de cuenta), backend y app
**Hallazgo:** PIL-01 (`NEXOS_SECURITY_AUDIT.md`, prioridad P0, CONFIRMADO)
**Fase del roadmap:** subfase 1E de `docs/roadmap-seguridad-escalabilidad-2026-08-25.md`

## Problema detectado

`POST /api/auth/establecer-password` fijaba la **primera** contraseña de una
cuenta pendiente de activar pidiendo solo teléfono y contraseña nueva. Y con eso
emitía sesión.

Es decir: **conocer un número de teléfono bastaba para apropiarse de una cuenta**
que su titular todavía no había activado. Un teléfono no es un secreto — está en
un albarán, en un grupo de WhatsApp, rotulado en la puerta de un taxi. Las
cuentas vulnerables eran exactamente las recién creadas por onboarding o por el
patrón al dar de alta a un asalariado: las que aún no ha tocado nadie.

Si la cuenta era la de un patrón, quien llegara antes que él se llevaba la flota,
los partes, los documentos y la economía del tenant.

## Causa

No fue un descuido: el propio código lo declaraba. El comentario decía que este
endpoint "solo exige conocer el teléfono", que era "un cierre parcial" y que lo
ideal sería verificar posesión, pero que quedaba **"pendiente de que Alberto
decida el canal de verificación"**.

Ahí está la causa real. El riesgo estaba identificado y escrito, y aun así siguió
en producción, porque estaba esperando una decisión que en realidad **ya se había
tomado en este mismo producto**.

## Solución aplicada

El 2026-08-12, para el problema idéntico de recuperación de contraseña, PilotOS
ya decidió que **el código va por email**: WhatsApp ataba una función crítica a
que Meta aprobase una plantilla, y a día de hoy no ha aprobado ninguna de las
cuatro enviadas. Se aplica esa misma decisión aquí en lugar de inventar un canal
nuevo ni seguir esperando.

La activación pasa a dos pasos, calcados de la recuperación:

1. `POST /api/auth/establecer-password/solicitar` → manda el código al email de
   la cuenta. Responde **siempre lo mismo**, exista o no la cuenta y esté o no
   pendiente: si distinguiera los casos, sería un oráculo para averiguar qué
   teléfonos usan PilotOS y cuáles siguen sin activar — justo los atacables.
2. `POST /api/auth/establecer-password` → teléfono + código + contraseña. La
   sesión **no se emite hasta verificar el código**.

**Sin duplicar lógica.** En vez de copiar el manejo de códigos, se extrajeron dos
helpers que ahora usan los dos flujos: `emitirCodigoPosesion` y
`verificarCodigoPosesion`. La recuperación se refactorizó para consumirlos, así
que el endurecimiento (TTL, un solo uso, quemado por intentos, quemado atómico)
vale para ambos y no puede divergir.

**Propósitos separados.** `password_resets` gana un campo `proposito`
(`RECUPERACION` | `BOOTSTRAP`). Un código pedido por un camino no vale para el
otro: si valiera, pedir uno de recuperación abriría la activación y al revés.
La migración es aditiva y con default, así que ningún código vivo se invalida al
desplegar.

**Frontend.** El cliente y la pantalla de login se actualizan al contrato nuevo.
Cuando el login responde `password_not_set`, se pide el código en ese mismo
momento —el teléfono ya está escrito— y se muestra un único formulario con
código + contraseña. Un paso más que antes, cero pantallas más.

## Evidencia

- `tsc --noEmit` limpio en backend y en app.
- 14 pruebas nuevas en `backend/tests/smoke.activacionCuenta.test.ts`:
  - **el vector original** (teléfono + contraseña, sin código) no crea sesión;
  - código inventado, caducado, ya usado (replay) y con los intentos agotados;
  - cuenta ya activada no se puede "reactivar";
  - un código de `RECUPERACION` no sirve para activar;
  - pedir uno de activación no invalida los de recuperación;
  - la solicitud responde igual para teléfono desconocido, cuenta ya activada y
    cuenta pendiente, mandando email **solo** en el último caso;
  - el código nunca viaja en la respuesta HTTP;
  - **control positivo**: con el código bueno el titular activa y recibe sesión,
    con contraseña y quemado del código en la misma transacción.
- Suite completa: 293 pasan.

> **Corrección (2026-08-26, al cerrar PIL-02).** Aquí se dijo que los 2 fallos
> restantes de la suite eran «previos y ajenos». Solo lo era uno. El otro,
> `smoke.recuperarPassword > pedir un código nuevo invalida los anteriores`, era
> una **regresión de este mismo cambio**: al acotar la invalidación por
> `proposito`, la aserción existente dejó de coincidir. Se contó el número de
> fallos del árbol limpio (2) y se dio por hecho que eran los mismos, sin
> comparar los nombres. Corregido: la prueba ahora comprueba el invariante
> nuevo —que solo se invalidan los códigos del mismo propósito— y se añadió otra
> que verifica que el código se emite con su propósito. El único fallo que queda
> es `smoke.ocrImagenReal`, flakiness de tesseract bajo carga, que pasa en
> aislamiento y también falla en el árbol limpio.
>
> La lección: **contar fallos no es compararlos.** Dos suites con el mismo
> número de fallos pueden estar fallando por cosas distintas.

## Riesgos residuales

- **No desplegado.** La migración `20260826120000_password_reset_proposito` está
  creada pero no aplicada.
- **Contrato roto a propósito.** Un cliente viejo que llame a
  `/establecer-password` sin `codigo` recibirá 400. Backend y app se despliegan
  juntos.
- **Asalariados antiguos con email sintético** (`telefono@pilotos.app`, dados de
  alta antes del 2026-08-12) **no pueden activarse solos**: no hay dónde mandar
  el código. Queda registrado en el log del servidor. El patrón tiene que
  ponerles un email real. Antes "funcionaban" precisamente porque no se
  verificaba nada, que es el fallo que se cierra. Conviene revisar cuántas
  cuentas están en esta situación antes de desplegar.
- El código es de 6 dígitos: la defensa contra fuerza bruta es el quemado a los
  5 intentos y el TTL de 15 minutos, no la entropía.
- **PIL-02 sigue abierto** (onboarding público sin verificar, JWT de 30 días
  duplicado en `localStorage`, sin revocación). Es Fase 2/3 del roadmap.

## Prevención futura

- **Un riesgo conocido y escrito en un comentario sigue siendo un riesgo
  abierto.** El `TODO` de seguridad no protege a nadie. Si algo queda pendiente
  de una decisión, esa decisión tiene fecha o el endpoint no sale.
- **Antes de esperar una decisión de negocio, comprobar si ya está tomada** en
  otro punto del mismo producto para el mismo problema. Aquí llevaba dos semanas
  tomada.
- **Ninguna operación que emita sesión puede apoyarse en un dato que no sea
  secreto.** Un teléfono, un email o un DNI identifican; no autentican.
- Recuperación y activación comparten helpers a propósito: endurecer uno
  endurece el otro.

Documento hermano: [`seguridad-token-interno-cli-01-2026-08-26.md`](../../ClinicOS/docs/learning/seguridad-token-interno-cli-01-2026-08-26.md).
