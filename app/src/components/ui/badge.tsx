import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-zinc-800 text-zinc-300',
        success: 'bg-emerald-900/50 text-emerald-400 border border-emerald-800',
        warning: 'bg-amber-900/50 text-amber-400 border border-amber-800',
        danger: 'bg-red-900/50 text-red-400 border border-red-800',
        info: 'bg-blue-900/50 text-blue-400 border border-blue-800',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
