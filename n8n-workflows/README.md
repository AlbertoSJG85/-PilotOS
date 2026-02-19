# Workflows n8n para PilotOS

## Descripción

Esta carpeta contiene las plantillas de workflows para n8n que automatizan PilotOS.

## Workflows

### WF-Inbound-WhatsApp
- **Trigger**: Webhook de WhatsApp (Meta Business API)
- **Función**: Recibe mensajes, los envía a GlorIA, y responde al usuario
- **Importar**: Archivo `wf-inbound-whatsapp.json`

### WF-Scheduler-Avisos
- **Trigger**: Cada hora
- **Función**: Revisa mantenimientos pendientes y anomalías, envía avisos por WhatsApp
- **Importar**: Archivo `wf-scheduler-avisos.json`

## Variables de Entorno Requeridas

```
BACKEND_URL=http://localhost:3001
WHATSAPP_PHONE_ID=tu-phone-id
WHATSAPP_TOKEN=tu-token
```

## Instalación

1. Acceder a n8n (self-hosted en Hetzner)
2. Ir a Settings > Import
3. Subir los archivos JSON
4. Configurar credenciales y variables

## Notas

- Los workflows usan `$env` para variables de entorno
- Configurar webhook URL en Meta Business Portal
- Los avisos de anomalías van al patrón, no al conductor
