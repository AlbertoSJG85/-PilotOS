import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get('pilotos_token')?.value;
  const esPatron = request.cookies.get('pilotos_es_patron')?.value === 'true';

  // ── Archivos estáticos y rutas de infraestructura ──────────────────────────
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/uploads') ||
    pathname === '/sw.js' ||
    pathname === '/manifest.json' ||
    pathname.match(/\.(png|svg|ico|webmanifest)$/)
  ) {
    return NextResponse.next();
  }

  // ── Rutas públicas: login y onboarding ────────────────────────────────────
  if (pathname === '/login' || pathname === '/onboarding' || pathname === '/') {
    if (token) {
      // Usuario ya autenticado → llevarlo a su área
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = esPatron ? '/admin' : '/conductor';
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.next();
  }

  // ── Área del conductor (/conductor/*) ─────────────────────────────────────
  if (pathname.startsWith('/conductor')) {
    if (!token) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
    // El patrón no debe entrar en el área del conductor
    if (esPatron) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── Área del patrón/admin (/admin, /partes, /gastos, /flota, etc.) ────────
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Rutas exclusivas del patrón
  if (pathname.startsWith('/admin') && !esPatron) {
    const url = request.nextUrl.clone();
    url.pathname = '/conductor';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
