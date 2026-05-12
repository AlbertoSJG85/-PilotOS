import type { Metadata } from 'next';
import { PilotOSDemo } from '@/components/marketing/pilotos-demo';

export const metadata: Metadata = {
  title: 'Demo PilotOS | Gestion inteligente para flotas',
  description:
    'Demo visual de PilotOS: partes diarios, GlorIA, gastos, mantenimientos, alertas y dashboard operativo para flotas.',
};

export default function DemoPage() {
  return <PilotOSDemo />;
}
