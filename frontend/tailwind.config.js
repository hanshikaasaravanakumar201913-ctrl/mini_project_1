/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic Two-Theme Design Tokens (RGB channel vars support Tailwind /opacity modifiers)
        canvas: 'rgb(var(--color-canvas-rgb) / <alpha-value>)',
        surface: 'rgb(var(--color-surface-rgb) / <alpha-value>)',
        'surface-alt': 'rgb(var(--color-surface-alt-rgb) / <alpha-value>)',
        field: 'rgb(var(--color-field-rgb) / <alpha-value>)',
        ink: 'rgb(var(--color-ink-rgb) / <alpha-value>)',
        'ink-muted': 'rgb(var(--color-ink-muted-rgb) / <alpha-value>)',
        brand: 'rgb(var(--color-brand-rgb) / <alpha-value>)',
        'on-brand': 'rgb(var(--color-on-brand-rgb) / <alpha-value>)',
        'brand-ink': 'rgb(var(--color-brand-ink-rgb) / <alpha-value>)',
        accent: 'rgb(var(--color-accent-rgb) / <alpha-value>)',
        line: 'rgb(var(--color-line-rgb) / <alpha-value>)',
        'line-strong': 'rgb(var(--color-line-strong-rgb) / <alpha-value>)',
        ring: 'rgb(var(--color-brand-rgb) / <alpha-value>)',
        danger: 'rgb(var(--color-danger-rgb) / <alpha-value>)',
        'on-danger': 'rgb(var(--color-on-danger-rgb) / <alpha-value>)',
        'danger-ink': 'rgb(var(--color-danger-ink-rgb) / <alpha-value>)',
        warning: 'rgb(var(--color-warning-rgb) / <alpha-value>)',
        'warning-ink': 'rgb(var(--color-warning-ink-rgb) / <alpha-value>)',
        'warning-bg': 'rgb(var(--color-warning-bg-rgb) / <alpha-value>)',
        success: 'rgb(var(--color-success-rgb) / <alpha-value>)',
        'success-ink': 'rgb(var(--color-success-ink-rgb) / <alpha-value>)',
        'success-bg': 'rgb(var(--color-success-bg-rgb) / <alpha-value>)',
        passport: 'rgb(var(--color-passport-rgb) / <alpha-value>)',
        'passport-ink': 'rgb(var(--color-passport-ink-rgb) / <alpha-value>)',
        'passport-sub': 'rgb(var(--color-passport-sub-rgb) / <alpha-value>)',
        // Legacy Medora brand reference tokens preserved
        medora: {
          'deep-teal': '#195A5F',
          'care-teal': '#12B8B0',
          'coral': '#D97F6C',
          'warm-white': '#F3EDE6',
          'surface-dark': '#0E393D',
          'surface-card': '#14464B',
          'surface-border': '#226D73',
          'surface-muted': '#EAE2D7',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'Plus Jakarta Sans', 'sans-serif'],
      },
      borderRadius: {
        'arc': '2.5rem',
      },
      boxShadow: {
        'card': 'var(--shadow-card)',
        'elevated': 'var(--shadow-elevated)',
      },
    },
  },
  plugins: [],
}
