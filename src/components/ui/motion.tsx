import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import type { VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { buttonVariants } from './button'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>

/** Static button (kept for API compatibility; hover handled by CSS). */
export const MotionButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), 'relative overflow-hidden', className)}
      {...props}
    >
      {children}
    </button>
  ),
)
MotionButton.displayName = 'MotionButton'

/** Static number (no count-up). */
export function AnimatedNumber({
  value,
  suffix = '',
  className,
}: {
  value: number
  suffix?: string
  className?: string
}) {
  return (
    <span className={className}>
      {Math.round(value)}
      {suffix}
    </span>
  )
}
