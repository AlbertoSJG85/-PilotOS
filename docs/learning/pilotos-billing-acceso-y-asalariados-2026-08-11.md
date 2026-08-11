# Billing, acceso y asalariados en PilotOS

- Fecha: 2026-08-11
- Área afectada: onboarding, acceso, mantenimiento proactivo y conductores.
- Problema detectado: el provisioning existía, pero PilotOS no consultaba entitlements, todas las funciones estaban abiertas y crear/desactivar asalariados no actualizaba una cantidad facturable en Pay.
- Causa: la integración inicial terminaba al crear la suscripción; no existía contrato de lectura ni de cantidades variables.
- Solución aplicada: acceso con última decisión conocida y fail-open degradado ante caída temporal; suspensión solo ante orden explícita de Pay; gates Pro por límites; mantenimiento/avisos proactivos protegidos; onboarding con asalariados solicita plan Pro; altas, reactivaciones y bajas publican la cantidad absoluta de asalariados mediante evento idempotente. El precio de 7,90 € se resuelve en el catálogo de Pay, no en PilotOS.
- Prevención futura: los productos publican hechos y cantidades, nunca precios ni incrementos relativos. Los datos operativos no se eliminan por cambios de plan o impago.

## Activación segura

Los planes `pilotos_control` y `pilotos_pro`, sus límites y el componente `asalariados_facturables` ya están cargados en staging. Los flags de enforcement permanecen apagados por defecto y solo se probaron con cuentas sintéticas; no deben activarse en producción hasta completar el backfill controlado. `NEXOS_PAY_PLAN_PRO` debe seguir siendo `pilotos_pro`.

## Verificación

- `npm run build`: correcto.
- `npm run test`: 73/73 pruebas correctas.
- No se aplicaron migraciones ni se desplegó.
