/**
 * CoalGuard Field - mobile design tokens.
 *
 * The spacing scale, type sizes and motion come from the SHARED package
 * `@coalguard/ui` so the mobile app and the web dashboard stay in sync on
 * rhythm. This file owns the mobile *appearance*: semantic colour roles, native
 * shadow objects, control heights, icon sizes and a typography preset table.
 *
 * RULE: components must read from `theme` - never hard-code a colour or a number.
 *
 * DIRECTION: CoalGuard Field is a LIGHT, HIGH-CONTRAST field interface. Mining
 * personnel read the screen for 1-3 seconds in dust, low ambient light, gloves
 * and sometimes direct sun. So: a warm off-white page (#F5F6F4), white cards,
 * near-black text (#111827), borders that survive low light, restrained safety
 * colour, minimal shadow, generous touch targets. It is NOT a dark app - "the
 * mine is dark" is answered with contrast and clarity, not a dark UI.
 */
import { fontSize, fontWeight, motion, palette, radius, spacing } from '@coalguard/ui/tokens';
import type { TextStyle } from 'react-native';

/* --------------------------------- colour -------------------------------- */

const color = {
  /** warm off-white page - easier on the eye than pure white, still bright */
  background: '#F5F6F4',
  /** cards / sheets / inputs sit on white for maximum text contrast */
  surface: '#FFFFFF',
  /** a subtle grey fill: skeletons, progress tracks, secondary tiles */
  surfaceRaised: '#EDEFF1',
  /** container border - deliberately visible in low light */
  border: '#D7DCE0',
  /** heavier border for critical / emphasised containers */
  borderStrong: '#B7C0C8',
  /** hairline divider inside a surface */
  hairline: '#E4E8EB',

  /** near-black primary text */
  textPrimary: '#111827',
  /** secondary text - passes AA on white AND on #F5F6F4 */
  textSecondary: '#5B6470',
  /** muted / metadata text - use sparingly, still AA on white */
  textMuted: '#6B7280',
  /** text on a dark (brand) surface */
  textInverse: '#FFFFFF',

  /** CoalGuard brand dark - primary buttons, brand marks */
  brand: '#1F2933',
  /** restrained amber accent - highlights only, never a large fill */
  accent: '#B26A00',

  /**
   * Semantic status colours: solid (dots / bars / borders), tint (badge fill)
   * and text (label / icon on the tint - AA contrast). Colour never travels
   * alone in the UI: every status also carries a Lucide icon + a text label.
   */
  status: {
    safe: { solid: '#16A34A', tint: '#E7F5EC', text: '#15803D' },
    warning: { solid: '#D97706', tint: '#FBF0E0', text: '#B45309' },
    highRisk: { solid: '#EA580C', tint: '#FBE9DE', text: '#C2410C' },
    critical: { solid: '#DC2626', tint: '#FBE6E6', text: '#B91C1C' },
    info: { solid: '#2563EB', tint: '#E5EDFD', text: '#1D4ED8' },
    neutral: { solid: '#6B7280', tint: '#EDEFF1', text: '#4B5563' },
  },
} as const;

export type StatusTone = keyof typeof color.status;

/* --------------------------------- shadow -------------------------------- */

/**
 * Native shadow presets. Deliberately faint - on a light UI, structure comes
 * from borders, not drop shadows. `md` is only for transient surfaces
 * (sheets, menus).
 */
const shadow = {
  none: {},
  sm: {
    shadowColor: '#0B0E10',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: '#0B0E10',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
} as const;

/* --------------------------------- sizing ------------------------------- */

/** Consistent icon sizing across the app. */
const iconSize = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

/** Minimum interactive heights - generous for gloved, outdoor use. */
const control = {
  sm: 44,
  md: 48,
  lg: 54,
} as const;

/** Animation durations (ms). Short and calm. */
const duration = {
  fast: motion.fast, // 120
  base: motion.base, // 200
  slow: motion.slow, // 320
} as const;

/* ------------------------------- typography ---------------------------- */

/**
 * Type presets - use these instead of ad-hoc font sizes.
 *   title       screen hero title      24 / bold
 *   heading     screen / section head  22 / semibold
 *   subheading  card / block title     18 / semibold
 *   body        default running text   16 / regular
 *   bodyStrong  emphasised body, buttons 16 / semibold
 *   label       section eyebrow        13 / semibold, lightly tracked
 *   caption     secondary / metadata   13 / regular
 *   kpi         large stat number      34 / bold
 */
const type: Record<
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyStrong'
  | 'label'
  | 'caption'
  | 'kpi'
  | 'mono',
  TextStyle
> = {
  display: { fontSize: 30, fontWeight: fontWeight.bold, letterSpacing: 0.2 },
  title: { fontSize: 24, fontWeight: fontWeight.bold, letterSpacing: 0.2 },
  heading: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold },
  subheading: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  body: { fontSize: fontSize.md, fontWeight: fontWeight.regular, lineHeight: 23 },
  bodyStrong: { fontSize: fontSize.md, fontWeight: fontWeight.semibold, lineHeight: 23 },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  caption: { fontSize: fontSize.sm, fontWeight: fontWeight.regular },
  kpi: { fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, letterSpacing: 0.5 },
  mono: { fontSize: fontSize.sm, fontVariant: ['tabular-nums'] },
};

/* --------------------------------- export ------------------------------ */

export const theme = {
  color,
  palette,
  spacing,
  radius,
  fontSize,
  fontWeight,
  shadow,
  iconSize,
  control,
  duration,
  type,
  /** Legacy alias kept so older code keeps working. */
  hitTarget: control.md,
} as const;

export type Theme = typeof theme;
