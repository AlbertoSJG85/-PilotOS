import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    // El proxy de rewrites corta el cuerpo a 10 MB y la subida falla (verificado
    // en producción el 2026-11-11). Las fotos ya salen reducidas del móvil, pero
    // si el navegador no sabe reducirlas (HEIC en Android) va el original; el
    // backend admite hasta 20 MB.
    proxyClientMaxBodySize: '25mb',
  },
  async rewrites() {
    // API_URL: server-side env var (container-to-container URL, never exposed to browser)
    const backendUrl = process.env.API_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${backendUrl}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
