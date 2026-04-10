'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { X, Download, Share } from 'lucide-react';

const DISMISSED_KEY = 'pilotos_install_dismissed_until';
const DISMISS_DAYS = 7;

function isDismissed(): boolean {
  if (typeof window === 'undefined') return true;
  const until = localStorage.getItem(DISMISSED_KEY);
  if (!until) return false;
  return Date.now() < Number(until);
}

function dismiss() {
  const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
  localStorage.setItem(DISMISSED_KEY, String(until));
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as any).standalone === true)
  );
}

function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isSafari(): boolean {
  if (typeof window === 'undefined') return false;
  return /safari/i.test(navigator.userAgent) && !/chrome|crios/i.test(navigator.userAgent);
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [isIOSSafari, setIsIOSSafari] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // No mostrar si ya está instalada como PWA
    if (isStandalone()) return;
    // No mostrar si el usuario ya lo descartó
    if (isDismissed()) return;

    const ios = isIOS() && isSafari();
    setIsIOSSafari(ios);

    if (ios) {
      // En iOS Safari no hay beforeinstallprompt — mostramos instrucciones manuales
      setShow(true);
      return;
    }

    // Android/Chrome: esperar el evento beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler as EventListener);
    return () => window.removeEventListener('beforeinstallprompt', handler as EventListener);
  }, []);

  function handleInstall() {
    if (!deferredPrompt) return;
    setInstalling(true);
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      setDeferredPrompt(null);
      setShow(false);
    }).finally(() => setInstalling(false));
  }

  function handleDismiss() {
    dismiss();
    setShow(false);
  }

  if (!show) return null;

  // ── iOS Safari: instrucciones manuales ───────────────────────────────────
  if (isIOSSafari) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 pb-safe-bottom">
        <div className="mx-3 mb-3 rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <Image
                src="/branding/pilotos/icon-180.png"
                alt="PilotOS"
                width={40}
                height={40}
                className="rounded-xl"
              />
              <div>
                <p className="text-sm font-semibold text-zinc-100">Instalar PilotOS</p>
                <p className="text-xs text-zinc-500">Acceso rápido desde tu pantalla de inicio</p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 transition-colors shrink-0"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-zinc-800/60 px-3 py-2.5 text-xs text-zinc-400">
            <Share className="h-4 w-4 text-pilot-lime shrink-0" />
            <span>Pulsa <strong className="text-zinc-200">Compartir</strong> → <strong className="text-zinc-200">Añadir a pantalla de inicio</strong></span>
          </div>
        </div>
      </div>
    );
  }

  // ── Android / Chrome: prompt nativo ─────────────────────────────────────
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pb-safe-bottom">
      <div className="mx-3 mb-3 rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <Image
            src="/branding/pilotos/icon-180.png"
            alt="PilotOS"
            width={44}
            height={44}
            className="rounded-xl shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-100">Instalar PilotOS</p>
            <p className="text-xs text-zinc-500">Instala la app para acceso rápido</p>
          </div>
          <button
            onClick={handleDismiss}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 transition-colors shrink-0"
            aria-label="Más tarde"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={handleDismiss}
            className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-400 hover:bg-zinc-800 transition-colors"
          >
            Más tarde
          </button>
          <button
            onClick={handleInstall}
            disabled={installing}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-pilot-lime py-2.5 text-sm font-semibold text-zinc-950 hover:bg-pilot-lime-dim transition-colors disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {installing ? 'Instalando...' : 'Instalar'}
          </button>
        </div>
      </div>
    </div>
  );
}
