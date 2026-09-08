import {
  AlertTriangle,
  BarChart3,
  Bell,
  ClipboardCheck,
  FileText,
  HardHat,
  LayoutDashboard,
  Map as MapIcon,
  MessageSquareWarning,
  Mountain,
  ScanText,
  Settings,
  ShieldCheck,
  User,
  UserCheck,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Permission } from '@coalguard/config';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Any one of these permissions grants the item. Omitted = always visible. */
  perm?: Permission[];
}

export const PRIMARY_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/inspections', label: 'Inspections', icon: ClipboardCheck, perm: ['inspection:read'] },
  { href: '/observations', label: 'Observations', icon: AlertTriangle, perm: ['observation:read'] },
  {
    href: '/corrective-actions',
    label: 'Corrective Actions',
    icon: Wrench,
    perm: ['corrective_action:read'],
  },
  { href: '/risk-map', label: 'Risk Map', icon: MapIcon, perm: ['observation:read'] },
  { href: '/compliance', label: 'Compliance', icon: ShieldCheck, perm: ['compliance:read'] },
  { href: '/documents', label: 'Documents', icon: ScanText, perm: ['compliance:read'] },
  { href: '/contractors', label: 'Contractors', icon: HardHat, perm: ['contractor:read'] },
  { href: '/attendance', label: 'Attendance', icon: UserCheck, perm: ['attendance:read'] },
  { href: '/grievances', label: 'Grievances', icon: MessageSquareWarning, perm: ['grievance:read'] },
  { href: '/mine-operations', label: 'Mine Operations', icon: Mountain, perm: ['equipment:read'] },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
];

export const UTILITY_NAV: NavItem[] = [
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export const DOCS_ICON = FileText;

/** Keep only the items this user's permission set unlocks. */
export function filterNav(items: NavItem[], permissions: string[]): NavItem[] {
  const set = new Set(permissions);
  return items.filter((i) => !i.perm || i.perm.some((p) => set.has(p)));
}

/** Longest matching nav href wins (so /inspections/[id] highlights Inspections). */
export function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}
