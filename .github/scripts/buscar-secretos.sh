#!/usr/bin/env bash
#
# Busca credenciales versionadas — Fase 3 del roadmap de seguridad.
#
# POR QUÉ SIN HERRAMIENTA EXTERNA. Lo estándar sería gitleaks o trufflehog. Se
# hace a mano y a propósito: meter una acción de terceros en el CI le da a ese
# tercero permiso de ejecución sobre este repositorio, y añadir una dependencia
# de cadena de suministro dentro de la fase que precisamente cierra riesgos de
# cadena de suministro sería contradictorio. Esto no encuentra todo; encuentra
# lo que de verdad se ha colado alguna vez en este ecosistema.
#
# Lo que busca son PATRONES DE VALOR REAL, no nombres de variable. `API_KEY=` en
# un `.env.example` es documentación; `API_KEY=sk-live-...` es un incidente.

set -uo pipefail

fallos=0

# Rutas que nunca se inspeccionan: dependencias, artefactos y este propio script
# (contiene los patrones y se delataría a sí mismo).
EXCLUIR=(
  ':(exclude)node_modules/**'
  ':(exclude)**/node_modules/**'
  ':(exclude)dist/**'
  ':(exclude)**/dist/**'
  ':(exclude).next/**'
  ':(exclude)**/.next/**'
  ':(exclude)package-lock.json'
  ':(exclude)**/package-lock.json'
  ':(exclude).github/scripts/buscar-secretos.sh'
)

# nombre|expresión regular
PATRONES=(
  'Clave privada|-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY'
  'Token de OpenAI|sk-[A-Za-z0-9]{20,}'
  'Token de GitHub|gh[pousr]_[A-Za-z0-9]{30,}'
  'Token de Slack|xox[baprs]-[A-Za-z0-9-]{10,}'
  'Clave de AWS|AKIA[0-9A-Z]{16}'
  'Token de Meta/Facebook|EAA[A-Za-z0-9]{60,}'
  'Cadena de conexion con contrasena|postgres(ql)?://[^:/@[:space:]]+:[^@[:space:]]{6,}@'
  'Clave de Stripe en vivo|sk_live_[A-Za-z0-9]{20,}'
)

# Marcadores de ejemplo. Una plantilla de despliegue DEBE poder enseñar la forma
# de una cadena de conexión sin que eso sea una alarma.
#
# Esto se descubrió probando el script antes de confiar en él: las tres primeras
# coincidencias eran `postgresql://USER:PASSWORD@...` en documentación. Un
# escáner que da la alarma en vano se acaba ignorando, y entonces el día que
# encuentre algo de verdad tampoco lo mirará nadie.
PLACEHOLDERS='USER|USERNAME|PASSWORD|PASS|CLAVE|USUARIO|CONTRASENA|password@|usuario:|@host[:/]|xxx+|XXX+|changeme|CHANGEME|placeholder|PLACEHOLDER|tu_|TU_|your_|YOUR_|<[^>]+>|\$\{[^}]+\}|\*\*\*+|user:pass'

# Credenciales de desarrollo local. Una cadena que apunta a `localhost` o a
# `127.0.0.1` no es una fuga: no se puede alcanzar desde fuera y describe el
# entorno de cada uno, no el nuestro.
#
# Se comprobó pasando el script por los siete repositorios: TODAS las
# coincidencias eran de este tipo. Sin este filtro, el CI de cinco productos
# nacería en rojo por credenciales de una base de datos que solo existe en el
# portátil de quien la levanta — y un CI que nace en rojo no se mira.
#
# Ojo: esto sí deja pasar un secreto de verdad si alguien lo usara contra un
# túnel a localhost. Es el precio consciente de que la herramienta se use.
LOCALES='@(localhost|127\.0\.0\.1|::1|host\.docker\.internal|db|postgres):'

echo "Buscando credenciales versionadas..."
echo

for entrada in "${PATRONES[@]}"; do
  nombre="${entrada%%|*}"
  patron="${entrada#*|}"

  # `git grep` solo mira lo versionado, que es justo lo que importa: un secreto
  # en un fichero ignorado no se ha publicado.
  resultado=$(git grep -nIE "$patron" -- . "${EXCLUIR[@]}" 2>/dev/null | grep -vE "$PLACEHOLDERS" | grep -vE "$LOCALES")

  if [ -n "$resultado" ]; then
    echo "❌ $nombre"
    # Se muestra el fichero y la línea, NUNCA el valor: este log es público.
    echo "$resultado" | cut -d: -f1,2 | sed 's/^/     /'
    echo
    fallos=$((fallos + 1))
  fi
done

# Los `.env` reales nunca se versionan. Los `.example` y `.demo` sí, pero
# entonces no pueden llevar valores dentro (ver CLI-01 en ClinicOS: `.env.demo`
# versionaba el token interno y la contraseña de admin).
if ficheros=$(git ls-files | grep -E '(^|/)\.env$|(^|/)\.env\.(local|production|prod)$' 2>/dev/null); then
  if [ -n "$ficheros" ]; then
    echo "❌ Ficheros .env versionados"
    echo "$ficheros" | sed 's/^/     /'
    echo
    fallos=$((fallos + 1))
  fi
fi

if [ "$fallos" -gt 0 ]; then
  echo "Se han encontrado $fallos tipo(s) de credencial en el codigo versionado."
  echo
  echo "Que hacer:"
  echo "  1. ROTAR la credencial. Ya esta en el historial de git: quitarla del"
  echo "     fichero no la invalida."
  echo "  2. Sacarla del codigo y leerla del entorno."
  echo "  3. Si era un ejemplo, dejar el nombre de la variable con el valor vacio."
  exit 1
fi

echo "✅ Sin credenciales detectadas."
