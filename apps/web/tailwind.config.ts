import type { Config } from 'tailwindcss';
import { palette, radius as radiusTokens } from '@coalguard/ui/tokens';

/**
 * The design system lives in @coalguard/ui/tokens. Here we map those raw values
 * onto Tailwind's colour scale and onto CSS variables (defined in globals.css)
 * so components can use semantic classes like `bg-surface` / `text-secondary`.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        graphite: palette.graphite,
        paper: palette.paper,
        accent: palette.accent,
        // semantic roles -> CSS variables (see globals.css)
        background: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-muted': 'rgb(var(--surface-muted) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        primary: 'rgb(var(--text-primary) / <alpha-value>)',
        secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
        // status
        safe: palette.green,
        warning: palette.amber,
        'high-risk': palette.orange,
        critical: palette.red,
        info: palette.blue,
      },
      borderRadius: {
        sm: `${radiusTokens.sm}px`,
        DEFAULT: `${radiusTokens.md}px`,
        md: `${radiusTokens.md}px`,
        lg: `${radiusTokens.lg}px`,
        xl: `${radiusTokens.xl}px`,
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,14,16,0.06), 0 1px 3px rgba(11,14,16,0.10)',
        overlay: '0 12px 32px rgba(11,14,16,0.24)',
      },
    },
  },
  plugins: [],
};

export default config;
