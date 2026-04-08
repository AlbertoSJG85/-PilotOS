/**
 * Genera el icono 192x192 de la PWA dinámicamente.
 * En producción, sustituir por un PNG estático optimizado.
 */
export function GET() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="40" fill="#09090b"/>
  <text x="96" y="80" font-family="system-ui, sans-serif" font-size="60" font-weight="900" text-anchor="middle" fill="#fafafa">P</text>
  <text x="96" y="140" font-family="system-ui, sans-serif" font-size="36" font-weight="900" text-anchor="middle" fill="#f59e0b">OS</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
