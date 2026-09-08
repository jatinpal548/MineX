/**
 * CoalGuard design tokens - the single source of truth for the visual identity.
 *
 * Plain data so BOTH platforms can consume it:
 *   - web   : fed into tailwind.config.ts + CSS variables in globals.css
 *   - mobile: fed into the React Native theme (src/lib/theme.ts)
 *
 * Direction: premium, industrial, modern. Deep charcoal / graphite surfaces,
 * off-white content areas, restrained accent, meaningful status colours.
 */

/* -------------------------------------------------------------------------- */
/* Colour                                                                     */
/* -------------------------------------------------------------------------- */

export const palette = {
  // graphite / charcoal ramp - primary industrial surface colour
  graphite: {
    50: '#f5f6f7',
    100: '#e6e8ea',
    200: '#c9ced2',
    300: '#a3abb2',
    400: '#6f7a83',
    500: '#4a545c',
    600: '#343d44',
    700: '#262d33',
    800: '#1b2126',
    900: '#12161a',
    950: '#0b0e10',
  },
  // off-white content surfaces
  paper: {
    0: '#ffffff',
    50: '#fbfbfa',
    100: '#f4f4f2',
    200: '#e9e9e5',
  },
  // restrained brand accent - a controlled amber/gold used sparingly
  accent: {
    400: '#f0b429',
    500: '#de911d',
    600: '#cb6e17',
  },
  // status colours (semantic - see `status` below for the mapping)
  green: { 500: '#1f9d55', 600: '#167544', bg: '#e3f4ea' },
  amber: { 500: '#d9a406', 600: '#b07d05', bg: '#fbf1d1' },
  orange: { 500: '#e8730c', 600: '#c15709', bg: '#fce6d4' },
  red: { 500: '#d64545', 600: '#b42318', bg: '#fbe3e0' },
  blue: { 500: '#2f74d0', 600: '#1f5aa8', bg: '#e1ecfb' },
} as const;

/** Semantic status tokens - always use these, never the raw palette. */
export const status = {
  safe: { fg: palette.green[600], solid: palette.green[500], bg: palette.green.bg },
  warning: { fg: palette.amber[600], solid: palette.amber[500], bg: palette.amber.bg },
  highRisk: { fg: palette.orange[600], solid: palette.orange[500], bg: palette.orange.bg },
  critical: { fg: palette.red[600], solid: palette.red[500], bg: palette.red.bg },
  info: { fg: palette.blue[600], solid: palette.blue[500], bg: palette.blue.bg },
} as const;

export type StatusToken = keyof typeof status;

/** Light theme semantic roles. */
export const lightTheme = {
  background: palette.paper[50],
  surface: palette.paper[0],
  surfaceMuted: palette.paper[100],
  border: palette.graphite[200],
  textPrimary: palette.graphite[900],
  textSecondary: palette.graphite[500],
  textInverse: palette.paper[0],
  brand: palette.graphite[800],
  accent: palette.accent[500],
} as const;

/** Dark theme semantic roles (command-center default look). */
export const darkTheme = {
  background: palette.graphite[950],
  surface: palette.graphite[900],
  surfaceMuted: palette.graphite[800],
  border: palette.graphite[700],
  textPrimary: palette.paper[50],
  textSecondary: palette.graphite[300],
  textInverse: palette.graphite[900],
  brand: palette.paper[50],
  accent: palette.accent[400],
} as const;

/* -------------------------------------------------------------------------- */
/* Spacing / radius / typography                                              */
/* -------------------------------------------------------------------------- */

/** 4px base scale. */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 22,
  '2xl': 28,
  '3xl': 34,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const fontFamily = {
  /** UI text. On web: Inter. On mobile: system. */
  sans: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  /** Data-dense tables, ids, coordinates, timestamps. */
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
} as const;

export const elevation = {
  card: '0 1px 2px rgba(11, 14, 16, 0.06), 0 1px 3px rgba(11, 14, 16, 0.10)',
  overlay: '0 12px 32px rgba(11, 14, 16, 0.24)',
} as const;

/** Motion - subtle only. */
export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
} as const;

export const tokens = {
  palette,
  status,
  lightTheme,
  darkTheme,
  spacing,
  radius,
  fontSize,
  fontWeight,
  fontFamily,
  elevation,
  motion,
} as const;

export type Tokens = typeof tokens;
