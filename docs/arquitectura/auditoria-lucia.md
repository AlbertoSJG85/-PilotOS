# Auditoría de LucIA

## 1. Dónde aparece mencionada
- **En PilotOS**:
  - `docs/producto/PilotOS_Master.md`: Se define como el subagente interno/especializado para el vertical taxi, aclarando que la única identidad visible hacia el usuario es GlorIA.
  - `docs/decisiones/decisiones-tecnicas.md` (DT-004): Especifica que LucIA no es un microservicio independiente, sino un "prompt/contexto especializado" que GlorIA carga al detectar el planeta `PILOTOS`.
  - `docs/arquitectura/arquitectura-inicial.md`: Confirma que opera como prompt dentro de GlorIA y que consume los endpoints `/internal/` de PilotOS.
  - `backend/src/routes/internal.routes.ts`: En los comentarios de los endpoints se menciona explícitamente que sirven para alimentar el prompt de LucIA (e.g., `/internal/kb/producto`).
- **En GlorIA**:
  - **No aparece mencionada** en el código fuente, prompts ni base de conocimiento de GlorIA.

## 2. Dónde está realmente integrada
- **Nivel Conceptual / Arquitectura**: Perfectamente definida en la documentación de PilotOS. El backend de PilotOS ya expone los endpoints necesarios (`/internal/kb/producto`, `/internal/resumen`, etc.) pensados para ella.
- **Implementación real**: GlorIA dispone de `fetchPilotOSData` en su servicio, que intercepta las peticiones y consulta dinámicamente `/internal/usuario-por-telefono` y `/internal/resumen` para alimentar la llamada a la IA de n8n. Además, la Base de Conocimiento de GlorIA carga automáticamente el manual operativo de PilotOS vía rest.

## 3. Estado de implementación (Actualizado Marzo 2026)
- **Implementado en PilotOS**: Endpoints expuestos, contrato token `x-internal-token`, documentación.
- **Implementado en GlorIA**: Interceptación en `getUserContext` según el `activePlanet` de la conversación. Anexión dinámica de la base de conocimiento `/api/gloria/kb`.
- **Falta**: Probar por WhatsApp el flujo E2E real para confirmar el formateo desde el lado del prompt maestro en n8n, y el despliegue del frontend para que el usuario pueda interactuar (aunque LucIA puede empezar a trabajar sin él).

## 5. Contradicciones detectadas
- **Docs vs Código**: La documentación asume que GlorIA actúa como router y deriva la conversación al prompt de LucIA (DT-004). El código de GlorIA simplemente corta la conversación indicando que PilotOS está en desarrollo.
- **Identidad**: El `PilotOS_Master.md` insiste en que GlorIA es la "única identidad visible", pero a veces llama a LucIA "subagente". Hay riesgo de confusión; LucIA debe ser estrictamente un *System Prompt* inyectado bajo la interfaz de GlorIA, sin presentarse nunca como "Hola, soy LucIA" al cliente final.

## 5. Plan ejecutado para dejarla representada (Fase Frente 1)
1. **En GlorIA (`gloria.service.ts`)**: Se añadió `fetchPilotOSData` que es llamado de forma oportunista por `getUserContext` cuando el `activePlanet` de la sesión de chat sea igual a `PILOTOS`.
2. **Creación del Contexto KB (`gloria.routes.ts`)**: La ruta `/kb` de GlorIA se ha modificado para que siempre anexe dinámicamente el resultado de `/internal/kb/producto` desde PilotOS, asegurando que cuando n8n invoque el contexto reciba la información más fresca de ambos mundos.
3. **Mantenimiento del Router Local**: El fallback de respuesta directa en local ha pasado de ser un mensaje de error a un mensaje de inicio de proceso, dejándole a la IA (n8n) el peso conversacional final.
