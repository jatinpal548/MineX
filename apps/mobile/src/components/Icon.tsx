/**
 * The single icon entry point for CoalGuard Field.
 *
 * We use ONE icon family (lucide) everywhere. Screens/components import `Icon`
 * and pass a `name` from `IconName` - they never import from lucide directly.
 * This keeps stroke width and sizing consistent and makes it trivial to swap
 * the icon set later.
 *
 * No emoji are used anywhere in this application.
 */
import {
  Activity,
  ArrowLeft,
  Bell,
  Building2,
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleMinus,
  CirclePlus,
  CircleUser,
  CircleX,
  ClipboardCheck,
  Clock,
  CloudOff,
  Cog,
  Eye,
  EyeOff,
  FileText,
  House,
  Image as ImageIcon,
  Info,
  Leaf,
  ListChecks,
  LoaderCircle,
  LogOut,
  MapPin,
  MapPinOff,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  SwitchCamera,
  TriangleAlert,
  Trash2,
  Users,
  Wind,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { theme } from '@/lib/theme';

export const iconRegistry = {
  home: House,
  inspection: ClipboardCheck,
  tasks: ListChecks,
  alerts: Bell,
  profile: CircleUser,
  settings: Settings,
  camera: Camera,
  location: MapPin,
  warning: TriangleAlert,
  critical: CircleAlert,
  completed: CircleCheck,
  documents: FileText,
  sync: RefreshCw,
  offline: CloudOff,
  online: Activity,
  environment: Leaf,
  equipment: Cog,
  users: Users,
  search: Search,
  chevronRight: ChevronRight,
  chevronLeft: ChevronLeft,
  back: ArrowLeft,
  close: X,
  scope: ShieldCheck,
  mine: Building2,
  signOut: LogOut,
  info: Info,
  electrical: Zap,
  dust: Wind,
  eye: Eye,
  eyeOff: EyeOff,
  spinner: LoaderCircle,
  pass: CircleCheck,
  fail: CircleX,
  na: CircleMinus,
  ai: Sparkles,
  add: CirclePlus,
  clock: Clock,
  image: ImageIcon,
  retake: RotateCcw,
  flipCamera: SwitchCamera,
  remove: Trash2,
  locationOff: MapPinOff,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof iconRegistry;

export interface IconProps {
  name: IconName;
  size?: keyof typeof theme.iconSize | number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({
  name,
  size = 'md',
  color = theme.color.textPrimary,
  strokeWidth = 2,
}: IconProps) {
  const Glyph = iconRegistry[name];
  const px = typeof size === 'number' ? size : theme.iconSize[size];
  return <Glyph size={px} color={color} strokeWidth={strokeWidth} />;
}
