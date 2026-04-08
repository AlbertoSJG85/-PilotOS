/** Icono 512x512 para PWA. En producción, usar PNG estático. */
export function GET() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="100" fill="#09090b"/>
  <text x="256" y="210" font-family="system-ui, sans-serif" font-size="160" font-weight="900" text-anchor="middle" fill="#fafafa">P</text>
  <text x="256" y="380" font-family="system-ui, sans-serif" font-size="100" font-weight="900" text-anchor="middle" fill="#f59e0b">OS</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
