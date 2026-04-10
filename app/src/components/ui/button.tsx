import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pilot-lime focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:     'bg-pilot-lime text-zinc-950 hover:bg-pilot-lime-dim shadow-sm font-semibold',
        secondary:   'bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
        outline:     'border border-zinc-700 bg-transparent text-zinc-100 hover:bg-zinc-800 hover:border-zinc-600',
        ghost:       'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
        destructive: 'bg-red-600 text-white hover:bg-red-700',
      },
      size: {
        sm:   'h-8 px-3 text-xs',
        md:   'h-10 px-4',
        lg:   'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
