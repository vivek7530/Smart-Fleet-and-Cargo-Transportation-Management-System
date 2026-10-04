import * as React from 'react';
import { CheckCircle2, Truck } from '@/components/icons';

const HIGHLIGHTS = [
  'Dispatch trips, assign trucks and track every consignment end to end.',
  'Capture fuel, tolls, maintenance and driver expenses against each trip.',
  'See revenue, cost and profit the moment a trip is closed.',
];

/**
 * Two-pane shell for the sign-in and registration screens: a brand panel on
 * larger displays, and just the form on a phone.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-background">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 max-w-2xl flex-col justify-between overflow-hidden bg-slate-950 p-10 text-slate-100 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              'radial-gradient(60rem 40rem at 15% 5%, rgba(99,102,241,0.32), transparent 60%), radial-gradient(45rem 35rem at 90% 90%, rgba(56,189,248,0.20), transparent 55%)',
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.16) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.16) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(60% 60% at 50% 40%, black, transparent)',
          }}
          aria-hidden
        />

        <div className="relative flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
            <Truck className="size-5" weight="bold" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">CargoEntry</span>
        </div>

        <div className="relative space-y-7">
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
            Every truck, trip and rupee — in one place.
          </h2>
          <ul className="space-y-3.5">
            {HIGHLIGHTS.map((highlight) => (
              <li key={highlight} className="flex gap-3 text-sm leading-relaxed text-slate-300">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-indigo-400" />
                <span className="max-w-sm">{highlight}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">
          Smart Fleet &amp; Cargo Transportation Management System
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[26rem]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Truck className="size-5" weight="bold" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">CargoEntry</span>
          </div>

          <div className="mb-7 space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? <p className="text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p> : null}
          </div>

          {children}

          {footer ? <div className="mt-7">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
