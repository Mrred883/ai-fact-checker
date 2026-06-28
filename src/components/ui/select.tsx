import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Opt {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (v: string) => void
  options: Opt[]
  className?: string
  id?: string
}

export function Select({ value, onChange, options, className, id }: SelectProps) {
  return (
    <div className={cn('relative', className)}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}
