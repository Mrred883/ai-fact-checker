import { useId } from 'react'

/**
 * The product mark: the litmus scale itself, miniaturized. A red→amber→green
 * track with an ink marker. `markerAt` is the marker position (0–100).
 * Inherits ink color via currentColor.
 */
export function LitmusMark({
  className,
  markerAt = 78,
}: {
  className?: string
  markerAt?: number
}) {
  const id = useId()
  const x = (markerAt / 100) * 28
  return (
    <svg viewBox="0 0 28 12" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e5484d" />
          <stop offset="0.5" stopColor="#f5a524" />
          <stop offset="1" stopColor="#1f9254" />
        </linearGradient>
      </defs>
      <rect x="0" y="4" width="28" height="4" rx="2" fill={`url(#${id})`} />
      <rect x={x - 1.1} y="0.5" width="2.2" height="11" rx="1.1" fill="currentColor" />
    </svg>
  )
}
