'use client';

import * as React from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { motion } from 'motion/react';
import { Fuel, MapPin, Route, ShieldCheck, Truck } from '@/components/icons';
import { Logo } from '@/components/brand/logo';
import { EASE_OUT } from '@/components/motion/primitives';

gsap.registerPlugin(useGSAP);

type Scene = 'login' | 'register';

const SCENES: Record<
  Scene,
  { image: string; alt: string; eyebrow: string; headline: string; sub: string }
> = {
  login: {
    image:
      'https://images.unsplash.com/photo-1592838064575-70ed626d3a0e?w=1600&q=75&auto=format&fit=crop',
    alt: 'A semi-truck parked on an open highway at dusk',
    eyebrow: 'Fleet & cargo operations',
    headline: 'Move freight, not paperwork.',
    sub: 'Dispatch trips, follow every truck and settle every rupee from one calm, fast workspace.',
  },
  register: {
    image:
      'https://images.unsplash.com/photo-1519003722824-194d4455a60c?w=1600&q=75&auto=format&fit=crop',
    alt: 'A loaded truck climbing a mountain highway',
    eyebrow: "You're invited",
    headline: 'Your seat on the dispatch desk is ready.',
    sub: 'Finish setting up your account to see the trips, trucks and expenses that are yours.',
  },
};

const FEATURES = [
  { icon: Route, title: 'Live trip board', text: 'Planned, loading, in transit, delivered — at a glance.' },
  { icon: Fuel, title: 'Every cost on the trip', text: 'Fuel, tolls, repairs and driver claims, reconciled.' },
  { icon: ShieldCheck, title: 'Compliance on autopilot', text: 'Insurance, permits and licences flagged early.' },
];

function Hero({ scene }: { scene: Scene }) {
  const root = React.useRef<HTMLElement>(null);
  const copy = SCENES[scene];

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        tl.from('[data-hero-img]', { scale: 1.14, duration: 2.2, ease: 'power2.out' }, 0)
          .from('[data-hero-logo]', { y: -14, autoAlpha: 0, duration: 0.6 }, 0.1)
          .from('[data-hero-chip]', { y: 10, autoAlpha: 0, duration: 0.5 }, 0.25)
          .from('[data-word]', { yPercent: 115, duration: 0.85, stagger: 0.055 }, 0.3)
          .from('[data-hero-sub]', { y: 14, autoAlpha: 0, duration: 0.6 }, 0.65)
          .from('[data-feature]', { x: -18, autoAlpha: 0, duration: 0.55, stagger: 0.08 }, 0.75)
          .from('[data-route]', { y: 28, autoAlpha: 0, duration: 0.7 }, 0.9);

        // The little truck on the route card keeps driving.
        gsap.fromTo(
          '[data-route-truck]',
          { left: '4%' },
          { left: '88%', duration: 5, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: 1.4 },
        );
        gsap.fromTo(
          '[data-route-fill]',
          { scaleX: 0.06 },
          { scaleX: 0.9, duration: 5, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: 1.4 },
        );
        gsap.to('[data-ping]', { scale: 2.4, autoAlpha: 0, duration: 1.4, ease: 'power1.out', repeat: -1 });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <aside
      ref={root}
      className="relative hidden w-[46%] max-w-[780px] shrink-0 overflow-hidden bg-[#0B1322] text-white lg:flex lg:flex-col"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        data-hero-img
        src={copy.image}
        alt={copy.alt}
        fetchPriority="high"
        className="absolute inset-0 size-full object-cover object-center"
      />
      <div
        className="absolute inset-0 bg-gradient-to-t from-[#0B1322] via-[#0B1322]/75 to-[#0B1322]/35"
        aria-hidden
      />

      <div className="relative flex h-full flex-col justify-between gap-6 p-10 xl:p-12">
        <div data-hero-logo>
          <Logo tone="onDark" tagline="Fleet operations" markClassName="h-10" />
        </div>

        <div className="space-y-6">
          <p data-hero-chip className="text-sm font-medium text-white/70">
            {copy.eyebrow}
          </p>

          <h1 className="max-w-lg text-[38px] font-semibold leading-[1.1] tracking-[-0.02em] xl:text-[44px]">
            {copy.headline.split(' ').map((word, index) => (
              <span key={index} className="mr-[0.24em] inline-block overflow-hidden pb-1 align-bottom">
                <span data-word className="inline-block">
                  {word}
                </span>
              </span>
            ))}
          </h1>

          <p data-hero-sub className="max-w-md text-[15px] leading-relaxed text-white/70">
            {copy.sub}
          </p>

          <ul className="space-y-3 [@media(max-height:820px)]:hidden">
            {FEATURES.map((feature) => (
              <li key={feature.title} data-feature className="flex items-center gap-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <feature.icon className="size-[18px] text-white" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{feature.title}</span>
                  <span className="block text-[13px] text-white/55">{feature.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Product glimpse: a trip on its way. */}
        <div
          data-route
          className="max-w-md rounded-xl border border-white/10 bg-[#0B1322]/70 p-4 [@media(max-height:700px)]:hidden"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold tracking-wide text-white/90">Trip on the road</span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-0.5 font-medium text-white/85">
              <span className="relative flex size-1.5">
                <span data-ping className="absolute inset-0 rounded-full bg-[#FF8A47]" />
                <span className="relative size-1.5 rounded-full bg-[#FF8A47]" />
              </span>
              In transit
            </span>
          </div>
          <div className="mt-4 flex items-center gap-3 text-[13px]">
            <MapPin className="size-4 shrink-0 text-white/60" />
            <span className="font-medium">Mumbai, MH</span>
            <div className="relative h-8 flex-1">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-white/25" />
              <div
                data-route-fill
                className="absolute inset-x-0 top-1/2 h-[2px] origin-left -translate-y-1/2 scale-x-50 rounded-full bg-gradient-to-r from-[#F26B21]/40 to-[#FF8A47]"
              />
              <span
                data-route-truck
                className="absolute top-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#E2581A]"
                style={{ left: '48%' }}
              >
                <Truck className="size-4 text-white" />
              </span>
            </div>
            <span className="font-medium">Ahmedabad, GJ</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

/**
 * Two-pane shell for the sign-in and registration screens. On desktop the
 * whole page fits the viewport — nothing scrolls.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  scene = 'login',
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scene?: Scene;
}) {
  return (
    <div className="flex min-h-dvh bg-background lg:h-dvh lg:overflow-hidden">
      <Hero scene={scene} />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="relative flex flex-1 items-center justify-center px-6 py-10 sm:px-10 lg:overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE_OUT, delay: 0.1 }}
            className="w-full max-w-[400px]"
          >
            <div className="mb-10 lg:hidden">
              <Logo tagline="Fleet operations" />
            </div>

            <div className="mb-8 space-y-2">
              <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">{title}</h2>
              {subtitle ? <p className="text-[14.5px] leading-relaxed text-muted-foreground">{subtitle}</p> : null}
            </div>

            {children}

            {footer ? <div className="mt-8">{footer}</div> : null}
          </motion.div>
        </div>

        <p className="relative px-6 pb-5 text-center text-xs text-muted-foreground sm:px-10">
          © {new Date().getFullYear()} CargoEntry · Smart Fleet &amp; Cargo Transportation Management
        </p>
      </main>
    </div>
  );
}
