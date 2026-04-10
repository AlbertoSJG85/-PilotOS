import { readFileSync } from 'fs';
import { join } from 'path';

/** Sirve el icono PNG real de PilotOS (192x192). Mantiene compatibilidad con manifests cacheados. */
export function GET() {
  try {
    const filePath = join(process.cwd(), 'public', 'branding', 'pilotos', 'icon-192.png');
    const file = readFileSync(filePath);
    return new Response(file, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=604800',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
