import type { Settings } from './types'

/** Apply light/dark class to <html> based on the user's theme preference. */
export function applyTheme(theme: Settings['theme']) {
  const root = document.documentElement
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)
}
