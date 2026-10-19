/**
 * Every icon the app draws comes through this file.
 *
 * Glyphs are Remix Icon line/fill pairs (https://remixicon.com), extracted into
 * `icon-paths.ts` by `npm run icons`. Pass `filled` for the solid variant —
 * navigation uses it to mark the current page.
 */
import * as React from 'react';
import { ICON_PATHS, type IconName } from './icon-paths';

/** Kept for older call sites: 'fill', 'duotone' and 'bold' map to the solid glyph. */
export type IconWeight = 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  filled?: boolean;
  weight?: IconWeight;
  size?: number | string;
}

export type Icon = React.ForwardRefExoticComponent<
  Omit<IconProps, 'ref'> & React.RefAttributes<SVGSVGElement>
>;

function icon(name: IconName): Icon {
  const Component = React.forwardRef<SVGSVGElement, Omit<IconProps, 'ref'>>(function RemixIcon(
    { filled, weight, size = 24, strokeWidth: _strokeWidth, ...props },
    ref,
  ) {
    const solid = filled ?? (weight === 'fill' || weight === 'duotone' || weight === 'bold');
    const paths = ICON_PATHS[name][solid ? 'fill' : 'line'];
    return React.createElement(
      'svg',
      {
        ref,
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'currentColor',
        'aria-hidden': props['aria-label'] ? undefined : true,
        focusable: false,
        ...props,
      },
      paths.map((d, index) => React.createElement('path', { key: index, d })),
    );
  });
  Component.displayName = name;
  return Component;
}

export const Accident = icon('Accident');
export const AlertCircle = icon('AlertCircle');
export const AlertTriangle = icon('AlertTriangle');
export const ArrowDown = icon('ArrowDown');
export const ArrowDownRight = icon('ArrowDownRight');
export const ArrowLeft = icon('ArrowLeft');
export const ArrowRight = icon('ArrowRight');
export const ArrowUp = icon('ArrowUp');
export const ArrowUpRight = icon('ArrowUpRight');
export const Audit = icon('Audit');
export const BadgeIndianRupee = icon('BadgeIndianRupee');
export const Ban = icon('Ban');
export const Bell = icon('Bell');
export const BellOff = icon('BellOff');
export const CalendarClock = icon('CalendarClock');
export const CalendarDays = icon('CalendarDays');
export const Check = icon('Check');
export const CheckCheck = icon('CheckCheck');
export const CheckCircle2 = icon('CheckCircle2');
export const ChevronDown = icon('ChevronDown');
export const ChevronRight = icon('ChevronRight');
export const ChevronsUpDown = icon('ChevronsUpDown');
export const ChevronUp = icon('ChevronUp');
export const Circle = icon('Circle');
export const CircleDollarSign = icon('CircleDollarSign');
export const CircleDot = icon('CircleDot');
export const ClipboardList = icon('ClipboardList');
export const Clock3 = icon('Clock3');
export const Command = icon('Command');
export const Copy = icon('Copy');
export const Eye = icon('Eye');
export const EyeOff = icon('EyeOff');
export const FileText = icon('FileText');
export const FileWarning = icon('FileWarning');
export const Files = icon('Files');
export const Fuel = icon('Fuel');
export const Gauge = icon('Gauge');
export const IdCard = icon('IdCard');
export const IndianRupee = icon('IndianRupee');
export const KeyRound = icon('KeyRound');
export const LayoutDashboard = icon('LayoutDashboard');
export const LifeBuoy = icon('LifeBuoy');
export const Loader2 = icon('Loader2');
export const Lock = icon('Lock');
export const LogIn = icon('LogIn');
export const LogOut = icon('LogOut');
export const Mail = icon('Mail');
export const MailCheck = icon('MailCheck');
export const Manager = icon('Manager');
export const MapPin = icon('MapPin');
export const Menu = icon('Menu');
export const Minus = icon('Minus');
export const Monitor = icon('Monitor');
export const Moon = icon('Moon');
export const MoreHorizontal = icon('MoreHorizontal');
export const Package = icon('Package');
export const PackageCheck = icon('PackageCheck');
export const Pencil = icon('Pencil');
export const Phone = icon('Phone');
export const PlayCircle = icon('PlayCircle');
export const Plus = icon('Plus');
export const RefreshCw = icon('RefreshCw');
export const RotateCcw = icon('RotateCcw');
export const Route = icon('Route');
export const Save = icon('Save');
export const ScrollText = icon('ScrollText');
export const Search = icon('Search');
export const SearchX = icon('SearchX');
export const Send = icon('Send');
export const Settings = icon('Settings');
export const ShieldCheck = icon('ShieldCheck');
export const SlidersHorizontal = icon('SlidersHorizontal');
export const Smartphone = icon('Smartphone');
export const SmartphoneNfc = icon('SmartphoneNfc');
export const Steering = icon('Steering');
export const Sun = icon('Sun');
export const Trash2 = icon('Trash2');
export const TrendingDown = icon('TrendingDown');
export const TrendingUp = icon('TrendingUp');
export const Truck = icon('Truck');
export const User = icon('User');
export const UserCheck = icon('UserCheck');
export const UserCog = icon('UserCog');
export const UserPlus = icon('UserPlus');
export const UserRound = icon('UserRound');
export const UserRoundCog = icon('UserRoundCog');
export const Users = icon('Users');
export const Wallet = icon('Wallet');
export const Wrench = icon('Wrench');
export const X = icon('X');
