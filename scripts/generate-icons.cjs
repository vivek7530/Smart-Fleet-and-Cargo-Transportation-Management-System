// Renders the chosen Remix icons to markup and writes their path data to a TS module.
const path = require('path');
const fs = require('fs');
const root = process.argv[2] ?? path.join(__dirname, '..');
const req = (m) => require(path.join(root, 'node_modules', m));
const React = req('react');
const { renderToStaticMarkup } = req('react-dom/server');
const Ri = req('@remixicon/react');

const MAP = {
  Accident: 'AlarmWarning', AlertCircle: 'ErrorWarning', AlertTriangle: 'Alert', ArrowDown: 'ArrowDown',
  ArrowDownRight: 'ArrowRightDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp',
  ArrowUpRight: 'ArrowRightUp', Audit: 'History', BadgeIndianRupee: 'Bill', Ban: 'Forbid', Bell: 'Notification3',
  BellOff: 'NotificationOff', CalendarClock: 'CalendarSchedule', CalendarDays: 'Calendar2', Check: 'Check',
  CheckCheck: 'CheckDouble', CheckCircle2: 'CheckboxCircle', ChevronDown: 'ArrowDownS', ChevronRight: 'ArrowRightS',
  ChevronsUpDown: 'ExpandUpDown', ChevronUp: 'ArrowUpS', Circle: 'CheckboxBlankCircle', CircleDollarSign: 'Coins',
  CircleDot: 'RecordCircle', ClipboardList: 'BarChartBox', Clock3: 'Time', Command: 'Command', Copy: 'FileCopy',
  Eye: 'Eye', EyeOff: 'EyeOff', FileText: 'FileText', FileWarning: 'FileWarning', Files: 'FileList3',
  Fuel: 'GasStation', Gauge: 'Dashboard3', IdCard: 'Profile', IndianRupee: 'MoneyRupeeCircle', KeyRound: 'Key2',
  LayoutDashboard: 'LayoutGrid', LifeBuoy: 'Lifebuoy', Loader2: 'Loader4', Lock: 'Lock2', LogIn: 'LoginBox',
  LogOut: 'LogoutBox', Mail: 'Mail', MailCheck: 'MailCheck', Manager: 'UserStar', MapPin: 'MapPin2', Menu: 'Menu',
  Minus: 'Subtract', Monitor: 'Computer', Moon: 'Moon', MoreHorizontal: 'More', Package: 'Box3',
  PackageCheck: 'Archive2', Pencil: 'Pencil', Phone: 'Phone', PlayCircle: 'PlayCircle', Plus: 'Add',
  RefreshCw: 'Refresh', RotateCcw: 'ArrowGoBack', Route: 'Route', Save: 'Save3', ScrollText: 'History',
  Search: 'Search', SearchX: 'Search2', Send: 'SendPlane', Settings: 'Settings3', ShieldCheck: 'ShieldCheck',
  SlidersHorizontal: 'Equalizer', Smartphone: 'Smartphone', SmartphoneNfc: 'Smartphone', Steering: 'Steering2',
  Sun: 'Sun', Trash2: 'DeleteBin6', TrendingDown: 'ArrowRightDown', TrendingUp: 'ArrowRightUp', Truck: 'Truck',
  User: 'User3', UserCheck: 'UserFollow', UserCog: 'UserSettings', UserPlus: 'UserAdd', UserRound: 'Steering2',
  UserRoundCog: 'UserShared', Users: 'Team', Wallet: 'Wallet3', Wrench: 'Tools', X: 'Close',
};

const paths = (name) => {
  const Component = Ri[name];
  if (!Component) throw new Error('Missing Remix icon: ' + name);
  const markup = renderToStaticMarkup(React.createElement(Component));
  return [...markup.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
};

const lines = [];
for (const [alias, base] of Object.entries(MAP)) {
  const line = paths(`Ri${base}Line`);
  const fill = paths(`Ri${base}Fill`);
  lines.push(`  ${alias}: { line: ${JSON.stringify(line)}, fill: ${JSON.stringify(fill)} },`);
}

const out = `/* Generated from Remix Icon (https://remixicon.com) line/fill pairs. Do not edit by hand. */
export const ICON_PATHS = {
${lines.join('\n')}
} as const satisfies Record<string, { line: readonly string[]; fill: readonly string[] }>;

export type IconName = keyof typeof ICON_PATHS;
`;
fs.writeFileSync(path.join(root, 'src', 'components', 'icon-paths.ts'), out);
console.log('icons:', Object.keys(MAP).length, 'bytes:', out.length);
