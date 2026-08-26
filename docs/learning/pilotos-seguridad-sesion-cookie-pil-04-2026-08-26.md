# PIL-04 — La sesión de PilotOS sale de `localStorage`

**Fecha:** 2026-08-26
**Área:** PilotOS · sesión (backend y app), CSRF
**Fase:** 3 del roadmap de seguridad y escalabilidad

## El problema

El JWT se guardaba en `localStorage` **y además** el propio JavaScript de la app
escribía una cookie con `document.cookie`, para que el `middleware.ts` de Next
pudiera leerla y decidir a qué páginas dejar entrar.

Las dos cosas son legibles por cualquier script que corra en el origen.
`localStorage` por definición; y una cookie escrita desde JavaScript **no puede
ser `HttpOnly`**, así que era una segunda copia del token exactamente igual de
expuesta, con su propia caducidad que podía divergir de la del token.

Aquí duele más que en otros productos: el token trae `es_patron` y `cliente_id`.
Con la sesión de un patrón van la flota, los partes y la economía del tenant.

PIL-03 ya permitía cortar una sesión. Pero cortar sirve cuando alguien se
entera, y de un robo de `localStorage` no se entera nadie.

## La solución

La cookie la pone **el servidor**, `HttpOnly`, y la app no la ve. `fetcher.ts` y
`upload.ts` dejan de construir cabeceras `Authorization` y solo piden
`credentials: 'include'`. El middleware de Next la sigue leyendo sin cambios,
porque la lee en el servidor.

## Tres decisiones que se apartan de lo que hizo RentOS, y por qué

**1. `SameSite=Lax`, no `Strict`.** No es relajar por comodidad: `Strict` rompe
este producto. `Strict` no manda la cookie en una navegación de nivel superior
que venga de otro sitio, y aquí el `middleware.ts` decide **en esa misma
navegación** si te manda a `/login`. Un conductor que abre el enlace desde
WhatsApp —que es como llega la gente a esta PWA— aterrizaría en el login estando
dentro. En RentOS `Strict` sí vale, porque sus páginas son estáticas y la sesión
se usa en la primera llamada de la propia página, que ya es del mismo sitio.
`Lax` sigue impidiendo lo que importa: la cookie no viaja en escrituras
cross-site. Y encima se comprueba el `Origin`.

**2. El acceso dura 24 h, no 2 h como en RentOS.** Quien usa esto es un taxista
con la PWA en el móvil durante la jornada; una sesión de 2 h le echaría a mitad
de turno. Es la misma razón por la que PIL-03 defendió una sesión larga. Lo que
sí cambia es que **el token rota**: se renueva mientras se usa, con techo
absoluto de 7 días que la rotación no puede saltarse (`sesionDesde` arrastra el
inicio real). Efecto: un conductor que trabaja a diario sigue dentro sin
enterarse; **un móvil robado que se queda quieto 24 h tiene la sesión muerta**,
cuando antes le quedaban siete días.

**3. Los 7 días dejan de ser la vida del token y pasan a ser el techo.** El
código pedía "access token corto + refresh rotativo" con tabla propia. No hizo
falta: con la cookie `HttpOnly`, la rotación con techo y el corte de PIL-03 se
consigue lo mismo sin una segunda fuente de verdad sobre quién tiene sesión.

## Lo que NO se hizo, y por qué

**No se dejó abierta la cabecera `Authorization` "durante la transición".** Era
la tentación evidente. Pero mientras esa puerta siga abierta el cambio no
arregla nada: cualquier token que un XSS se hubiera llevado antes del despliegue
sigue valiendo por esa vía. **Un puente de compatibilidad dentro de un cierre de
seguridad es el propio agujero con otro nombre.** Queda
`SESSION_ACEPTA_BEARER=true`, apagado por defecto.

**`Secure` no depende de `NODE_ENV`.** Causa literal de CLI-01.

## Un detalle de entorno local que ahora importa

`NEXT_PUBLIC_API_URL` debe ir **vacía también en desarrollo**. Si el navegador
habla directamente con `localhost:3001`, la cookie queda en ese host, y entonces
un `<img src="/uploads/...">` servido desde `localhost:3000` no la lleva y la
foto da 401. Es el mismo problema que `lib/utils/documento-url.ts` explica para
producción, adelantado a local. Con la variable vacía todo pasa por el proxy de
`next.config.ts`, el navegador ve un solo origen, y el entorno local se parece a
producción, que es donde uno quiere que se parezca.

## Verificación

- Typecheck limpio en backend y app.
- 19 pruebas nuevas en `smoke.sesionCookie.test.ts`. Suite **328/329**.
- El único fallo es `smoke.ocrImagenReal > lee lo que pone el papel`. **Se
  comparó por nombre contra el árbol limpio, no por número** —la lección de
  PIL-02—: dos pasadas de la suite completa en el árbol limpio dieron 1 y 2
  fallos, siempre los mismos nombres de OCR. Es la intermitencia de tesseract ya
  conocida, ajena a este cambio.
- Bypass probado: un token válido por cabecera `Authorization` **no entra**, con
  control positivo de que el mismo token por cookie sí.
- Rotación probada en los tres casos: recién emitido (no rota), mediado (rota),
  pasado el techo (deja de rotar).
- Probado que **la revocación gana a la rotación**: con el corte puesto, un
  token mediado recibe `sesion_revocada` y no se le emite cookie nueva. Si el
  orden estuviera al revés, un intruso se renovaría a sí mismo en la misma
  petición en la que debería ser expulsado.

## Aserciones que hubo que reapuntar (y por qué importa)

Tres pruebas anteriores comprobaban "recibe sesión" / "no crea sesión" mirando
si el cuerpo traía `token`. Con este cambio el token **nunca** va en el cuerpo,
así que `not.toHaveProperty('token')` se habría vuelto cierta siempre: la prueba
de seguridad de PIL-01 habría seguido en verde **sin probar nada**. Se
reapuntaron a donde ahora vive la sesión (`res.cookie`). Es el mismo tipo de
fallo que la revisión de 1D encontró en ClinicOS: un test cuya intención se
invierte en silencio al cambiar el contrato de debajo.

Lo mismo con `el token no dura más de 7 días`, que seguiría pasando con un token
de 24 h. Ahora comprueba el valor real.

## Riesgo residual

- **No desplegado.** Backend y app tienen que ir juntos: el contrato cambia a
  propósito (`LoginResponse` ya no trae `token`).
- **Todas las sesiones abiertas se caen al desplegar.** Intencionado.
- `ALLOWED_ORIGINS` debe estar bien puesta o toda escritura desde el navegador
  se rechaza con 403. Si no está definida, la comprobación de origen no se
  aplica y queda solo `SameSite=Lax` — que es el mismo criterio que ya seguía
  `cors()` en `index.ts`.
- `SESSION_COOKIE_INSECURE` no debe estar puesta en producción.
- Falta el equivalente en los demás frontales del ecosistema que aún guarden
  sesión en el navegador.
