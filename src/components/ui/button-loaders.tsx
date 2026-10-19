'use client';

import * as React from 'react';
import { motion, type Transition } from 'motion/react';

/**
 * Busy-state animations for buttons, one per area of the app, so saving a fuel
 * entry fills a fuel drop, saving a driver turns a steering wheel, and so on.
 * Everything draws in `currentColor`, so it suits solid and outline buttons.
 */
export type LoaderKind =
  | 'truck'
  | 'fuel'
  | 'driver'
  | 'maintenance'
  | 'trip'
  | 'cargo'
  | 'expense'
  | 'document'
  | 'breakdown'
  | 'invite'
  | 'settings'
  | 'report'
  | 'delete';

const ROUTE_LOADERS: [string, LoaderKind][] = [
  ['/fuel', 'fuel'],
  ['/maintenance', 'maintenance'],
  ['/breakdowns', 'breakdown'],
  ['/drivers', 'driver'],
  ['/my-truck', 'truck'],
  ['/trucks', 'truck'],
  ['/my-trips', 'trip'],
  ['/trips', 'trip'],
  ['/cargo', 'cargo'],
  ['/expenses', 'expense'],
  ['/transportation-costs', 'expense'],
  ['/documents', 'document'],
  ['/users', 'invite'],
  ['/managers', 'invite'],
  ['/register', 'invite'],
  ['/settings', 'settings'],
  ['/profile', 'settings'],
  ['/reports', 'report'],
];

export function loaderForPath(pathname: string | null): LoaderKind {
  if (!pathname) return 'truck';
  return ROUTE_LOADERS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? 'truck';
}

const loop = (duration: number, extra?: Transition): Transition => ({
  duration,
  repeat: Infinity,
  ease: 'easeInOut',
  ...extra,
});

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className: 'size-[22px] overflow-visible',
};

/** A fuel drop filling from the bottom while a drip falls into it. */
function FuelLoader() {
  const id = React.useId();
  const drop = 'M12 4c3.4 4.2 6.2 7.6 6.2 10.8a6.2 6.2 0 0 1-12.4 0C5.8 11.6 8.6 8.2 12 4z';
  return (
    <svg {...svgProps}>
      <defs>
        <clipPath id={id}>
          <path d={drop} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <motion.rect
          x="4"
          width="16"
          height="20"
          fill="currentColor"
          stroke="none"
          initial={{ y: 21 }}
          animate={{ y: [21, 8, 8, 21] }}
          transition={loop(1.8, { times: [0, 0.7, 0.85, 1] })}
        />
      </g>
      <path d={drop} />
      <motion.circle
        cx="12"
        r="1.1"
        fill="currentColor"
        stroke="none"
        initial={{ cy: -3, opacity: 0 }}
        animate={{ cy: [-3, 9], opacity: [0, 1, 0] }}
        transition={loop(0.9, { ease: 'easeIn' })}
      />
    </svg>
  );
}

/** A steering wheel turning left and right. */
function DriverLoader() {
  return (
    <motion.svg {...svgProps} animate={{ rotate: [0, -75, 60, 0] }} transition={loop(1.6)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2" />
      <path d="M3.7 10.6h6.4M13.9 10.6h6.4M12 14v6.4" />
    </motion.svg>
  );
}

/** A wrench working a bolt. */
function MaintenanceLoader() {
  return (
    <svg {...svgProps}>
      <path d="M6 18.5h12" opacity="0.4" />
      <motion.g
        style={{ originX: '30%', originY: '70%' }}
        animate={{ rotate: [-28, 22, -28] }}
        transition={loop(0.9)}
      >
        <path d="M14.6 5.4a3.9 3.9 0 0 0-5 5L4.8 15.2a1.6 1.6 0 1 0 2.3 2.3l4.8-4.8a3.9 3.9 0 0 0 5-5l-2.3 2.3-2.2-.4-.4-2.2z" />
      </motion.g>
    </svg>
  );
}

/** A pin travelling along a dashed route to its destination. */
function TripLoader() {
  return (
    <svg {...svgProps} viewBox="0 0 40 24" className="h-[22px] w-[38px] overflow-visible">
      <path d="M4 17h32" strokeDasharray="1.5 3.2" opacity="0.5" />
      <circle cx="36" cy="17" r="1.8" fill="currentColor" stroke="none" />
      <motion.g initial={{ x: 0 }} animate={{ x: [0, 30, 30] }} transition={loop(1.6, { times: [0, 0.85, 1] })}>
        <path d="M6 15.5c-2.6-2.6-3.6-4.2-3.6-6a3.6 3.6 0 0 1 7.2 0c0 1.8-1 3.4-3.6 6z" fill="currentColor" stroke="none" />
        <circle cx="6" cy="9.4" r="1.2" className="fill-[hsl(var(--primary))]" stroke="none" />
      </motion.g>
    </svg>
  );
}

/** A box dropping onto a stack. */
function CargoLoader() {
  return (
    <svg {...svgProps}>
      <rect x="3.5" y="15" width="7.5" height="6" rx="1" />
      <rect x="13" y="15" width="7.5" height="6" rx="1" />
      <motion.g
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: [-12, 0, 0, 0], opacity: [0, 1, 1, 0] }}
        transition={loop(1.4, { times: [0, 0.45, 0.8, 1], ease: 'easeOut' })}
      >
        <rect x="8.2" y="7" width="7.6" height="6.2" rx="1" fill="currentColor" stroke="none" />
      </motion.g>
    </svg>
  );
}

/** A rupee coin flipping. */
function ExpenseLoader() {
  return (
    <svg {...svgProps}>
      <motion.g animate={{ scaleX: [1, 0.12, 1], y: [0, -2.5, 0] }} transition={loop(0.9)}>
        <circle cx="12" cy="12" r="8" />
        <path d="M9 8.6h6M9 11.2h6M10.6 8.6c2.6 0 2.6 4.6 0 4.6H9.2l4.4 3.8" strokeWidth="1.6" />
      </motion.g>
    </svg>
  );
}

/** A page whose lines are being written. */
function DocumentLoader() {
  return (
    <svg {...svgProps}>
      <path d="M6 3.5h8l4 4v13H6z" />
      <path d="M14 3.5v4h4" />
      {[10.5, 13.5, 16.5].map((y, index) => (
        <motion.path
          key={y}
          d={`M8.8 ${y}h6.4`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: [0, 1, 1, 0] }}
          transition={loop(1.8, { times: [0, 0.3 + index * 0.15, 0.85, 1] })}
        />
      ))}
    </svg>
  );
}

/** A roadside warning beacon flashing. */
function BreakdownLoader() {
  return (
    <svg {...svgProps}>
      <path d="M12 4.5 20 19H4z" />
      <path d="M12 10v3.6" />
      <circle cx="12" cy="16.2" r="0.6" fill="currentColor" />
      <motion.g animate={{ opacity: [0.15, 1, 0.15] }} transition={loop(0.7)}>
        <path d="M3 8.5 1.5 7.5M21 8.5l1.5-1M12 1.5v-.5" />
      </motion.g>
    </svg>
  );
}

/** A paper plane taking off. */
function InviteLoader() {
  return (
    <svg {...svgProps}>
      <motion.g
        animate={{ x: [-5, 6, 6], y: [5, -6, -6], opacity: [0, 1, 0] }}
        transition={loop(1.2, { times: [0, 0.75, 1], ease: 'easeOut' })}
      >
        <path d="M20.5 3.5 3.5 10.5l6.6 2.4 2.4 6.6z" fill="currentColor" fillOpacity="0.15" />
        <path d="m10.1 12.9 4.6-4.6" />
      </motion.g>
    </svg>
  );
}

/** Two gears meshing. */
function SettingsLoader() {
  const gear = (cx: number, cy: number, r: number) => {
    const teeth = Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4;
      return `M${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}L${cx + Math.cos(a) * (r + 2)} ${cy + Math.sin(a) * (r + 2)}`;
    }).join('');
    return (
      <>
        <circle cx={cx} cy={cy} r={r} />
        <circle cx={cx} cy={cy} r={r / 2.6} />
        <path d={teeth} strokeWidth="2.2" />
      </>
    );
  };
  return (
    <svg {...svgProps}>
      <motion.g animate={{ rotate: 360 }} transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}>
        {gear(9.5, 10, 4.6)}
      </motion.g>
      <motion.g animate={{ rotate: -360 }} transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}>
        {gear(17.6, 17.4, 2.6)}
      </motion.g>
    </svg>
  );
}

/** Bars growing like a chart redrawing. */
function ReportLoader() {
  return (
    <svg {...svgProps}>
      <path d="M3.5 20.5h17" />
      {[6.5, 12, 17.5].map((x, index) => (
        <motion.path
          key={x}
          d={`M${x} 18V8`}
          strokeWidth="3"
          initial={{ pathLength: 0.2 }}
          animate={{ pathLength: [0.2, 1, 0.2] }}
          transition={loop(1.1, { delay: index * 0.18 })}
        />
      ))}
    </svg>
  );
}

/** A bin whose lid lifts as something drops in. */
function DeleteLoader() {
  return (
    <svg {...svgProps}>
      <path d="M6.5 8.5h11l-1 12h-9z" />
      <path d="M10.2 11.5v6M13.8 11.5v6" opacity="0.6" />
      <motion.g style={{ originX: '20%', originY: '100%' }} animate={{ rotate: [0, -32, 0] }} transition={loop(1)}>
        <path d="M5 6.5h14M10 6.5V5h4v1.5" />
      </motion.g>
    </svg>
  );
}

/** The delivery truck driving along a dashed road. */
function TruckLoader() {
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden>
      <span className="absolute inset-x-2 bottom-[5px] h-px animate-road-scroll bg-[length:10px_1px] bg-repeat-x opacity-50 [background-image:linear-gradient(90deg,currentColor_55%,transparent_0)]" />
      <span className="absolute bottom-[6px] left-0 block h-[13px] w-[25px] animate-button-truck">
        <svg viewBox="0 0 66 36" className="size-full overflow-visible">
          <rect x="1" y="3" width="39" height="21" rx="3" fill="currentColor" />
          <path d="M42 9.5h10.4c1.7 0 2.9.7 3.7 2.2l4.3 7.6c.4.7.6 1.4.6 2.2V24H42z" fill="currentColor" />
          <rect x="1" y="24" width="61" height="3.2" rx="1.6" fill="currentColor" />
          {[13, 51].map((cx) => (
            <g key={cx} className="animate-spin [animation-duration:0.5s] [transform-box:fill-box] [transform-origin:center]">
              <circle cx={cx} cy="30.4" r="5.4" fill="currentColor" />
              <path d={`M${cx} 26v8.8`} stroke="black" strokeOpacity="0.35" strokeWidth="1.4" />
            </g>
          ))}
        </svg>
      </span>
    </span>
  );
}

const CENTRED: Record<Exclude<LoaderKind, 'truck'>, () => React.JSX.Element> = {
  fuel: FuelLoader,
  driver: DriverLoader,
  maintenance: MaintenanceLoader,
  trip: TripLoader,
  cargo: CargoLoader,
  expense: ExpenseLoader,
  document: DocumentLoader,
  breakdown: BreakdownLoader,
  invite: InviteLoader,
  settings: SettingsLoader,
  report: ReportLoader,
  delete: DeleteLoader,
};

export function ButtonLoader({ kind }: { kind: LoaderKind }) {
  if (kind === 'truck') return <TruckLoader />;
  const Animation = CENTRED[kind];
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      <Animation />
    </span>
  );
}
