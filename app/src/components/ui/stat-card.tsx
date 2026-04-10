'use client';

import { Card } from './card';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info';
  className?: string;
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, variant = 'default', className }: StatCardProps) {
  const iconColors: Record<string, string> = {
    default: 'text-pilot-lime',
    success: 'text-emerald-400',
    danger:  'text-red-400',
    warning: 'text-amber-400',
    info:    'text-blue-400',
  };
  const bgColors: Record<string, string> = {
    default: 'bg-pilot-lime/10',
    success: 'bg-emerald-500/10',
    danger:  'bg-red-500/10',
    warning: 'bg-amber-500/10',
    info:    'bg-blue-500/10',
  };

  return (
    <Card className={cn('flex items-start gap-4', className)}>
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', bgColors[variant])}>
        <Icon className={cn('h-5 w-5', iconColors[variant])} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium">{title}</p>
        <p className={cn(
          'text-2xl font-bold text-zinc-100 mt-0.5',
          trend === 'up'   && 'text-emerald-400',
          trend === 'down' && 'text-red-400',
        )}>
          {value}
        </p>
        {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
    </Card>
  );
}
