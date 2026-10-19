'use client';

import * as React from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ArrowRight, Check } from '@/components/icons';
import { cn } from '@/lib/utils';

gsap.registerPlugin(useGSAP);

export type TruckButtonPhase = 'idle' | 'loading' | 'success' | 'error';

/** Hand-drawn delivery truck: container, cab, two spinning wheels. */
function TruckGraphic() {
  return (
    <svg viewBox="0 0 66 36" className="h-full w-full overflow-visible" aria-hidden>
      <g data-body>
        {/* Container */}
        <rect x="1" y="3" width="39" height="21" rx="3" fill="#fff" />
        <g stroke="hsl(16 85% 45%)" strokeOpacity="0.28" strokeWidth="1.4" strokeLinecap="round">
          <path d="M11 7.5v12M20.5 7.5v12M30 7.5v12" />
        </g>
        {/* Cab */}
        <path d="M42 9.5h10.4c1.7 0 2.9.7 3.7 2.2l4.3 7.6c.4.7.6 1.4.6 2.2V24H42z" fill="#fff" />
        <path d="M45.5 12.2h6.2c.8 0 1.4.4 1.8 1.1l2.3 4.4H45.5z" fill="#0E1A30" opacity="0.85" />
        <rect x="58.6" y="20" width="2.6" height="2" rx="1" fill="#FFD27A" />
        {/* Chassis */}
        <rect x="1" y="24" width="61" height="3.2" rx="1.6" fill="#fff" />
        {/* Wheel arches: button-coloured cut-outs so each tyre sits in its well. */}
        {[13, 51].map((cx) => (
          <circle key={cx} cx={cx} cy="30.4" r="6.9" fill="hsl(var(--primary))" />
        ))}
      </g>
      {[13, 51].map((cx) => (
        <g key={cx} data-wheel>
          {/* Tyre */}
          <circle cx={cx} cy="30.4" r="5.4" fill="#0E1A30" />
          <circle cx={cx} cy="30.4" r="4.9" fill="none" stroke="#2B3D5E" strokeWidth="0.8" strokeDasharray="1.2 1.1" />
          {/* Rim and hub */}
          <circle cx={cx} cy="30.4" r="2.9" fill="#E7EBF2" />
          <circle cx={cx} cy="30.4" r="1.1" fill="#0E1A30" />
          {/* Spokes make the spin readable. */}
          <path
            d={`M${cx} 27.7v1.5M${cx} 31.6v1.5M${cx - 2.7} 30.4h1.5M${cx + 1.2} 30.4h1.5`}
            stroke="#0E1A30"
            strokeWidth="0.7"
            strokeLinecap="round"
          />
        </g>
      ))}
    </svg>
  );
}

/**
 * Submit button that turns into a short delivery: a truck rolls in while the
 * request is in flight, drives off on success, and reverses out on failure.
 * `onDelivered` fires as the truck leaves, so navigation is never held back by
 * the animation finishing.
 */
export function TruckButton({
  phase,
  onDelivered,
  className,
  children,
  successLabel = 'Signed in',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  phase: TruckButtonPhase;
  onDelivered?: () => void;
  successLabel?: string;
}) {
  const root = React.useRef<HTMLButtonElement>(null);
  const loops = React.useRef<gsap.core.Tween[]>([]);
  const deliveredRef = React.useRef(onDelivered);
  deliveredRef.current = onDelivered;

  const stopLoops = () => {
    for (const tween of loops.current) tween.kill();
    loops.current = [];
  };

  useGSAP(
    () => {
      const button = root.current;
      if (!button) return;
      const q = gsap.utils.selector(button);
      const truck = q('[data-truck]')[0] as HTMLElement;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const centre = () => (button.offsetWidth - truck.offsetWidth) / 2;

      if (phase === 'idle') {
        stopLoops();
        gsap.set(q('[data-scene]'), { autoAlpha: 0 });
        gsap.set(truck, { x: -90 });
        gsap.to(q('[data-label]'), { y: 0, autoAlpha: 1, duration: 0.25, ease: 'power2.out' });
        gsap.set(q('[data-done]'), { autoAlpha: 0, y: 14 });
        return;
      }

      if (phase === 'loading') {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        tl.to(q('[data-label]'), { y: -22, autoAlpha: 0, duration: 0.2, ease: 'power2.in' })
          .to(q('[data-scene]'), { autoAlpha: 1, duration: 0.15 }, '<0.05');

        if (reduced) {
          tl.set(truck, { x: centre() });
          return;
        }

        tl.fromTo(truck, { x: -90 }, { x: centre, duration: 0.5 }, '<');
        loops.current = [
          // SVG elements rotate around their top-left corner unless told otherwise.
          gsap.to(q('[data-wheel]'), {
            rotation: 360,
            transformOrigin: '50% 50%',
            duration: 0.45,
            ease: 'none',
            repeat: -1,
          }),
          gsap.to(q('[data-road]'), { backgroundPositionX: '-36px', duration: 0.32, ease: 'none', repeat: -1 }),
          gsap.to(q('[data-body]'), { y: -0.8, duration: 0.16, ease: 'sine.inOut', yoyo: true, repeat: -1 }),
          gsap.fromTo(
            q('[data-puff]'),
            { x: 0, scale: 0.4, autoAlpha: 0.7 },
            { x: -14, scale: 1.4, autoAlpha: 0, duration: 0.6, ease: 'power1.out', stagger: 0.2, repeat: -1 },
          ),
        ];
        return;
      }

      if (phase === 'success') {
        const tl = gsap.timeline();
        tl.to(truck, { x: () => button.offsetWidth + 24, duration: reduced ? 0 : 0.42, ease: 'power3.in' })
          .call(() => deliveredRef.current?.(), [], reduced ? 0 : 0.22)
          .add(stopLoops)
          .to(q('[data-scene]'), { autoAlpha: 0, duration: 0.15 })
          .fromTo(
            q('[data-done]'),
            { autoAlpha: 0, y: 14 },
            { autoAlpha: 1, y: 0, duration: 0.3, ease: 'back.out(2)' },
            '<',
          );
        return;
      }

      // Failed: the truck backs out and the button gives a small shake.
      const tl = gsap.timeline();
      tl.to(truck, { x: -90, duration: reduced ? 0 : 0.35, ease: 'power2.in' })
        .add(stopLoops)
        .to(q('[data-scene]'), { autoAlpha: 0, duration: 0.15 })
        .to(q('[data-label]'), { y: 0, autoAlpha: 1, duration: 0.25, ease: 'power2.out' }, '<')
        .fromTo(button, { x: 0 }, { keyframes: { x: [-7, 6, -4, 3, 0] }, duration: 0.42, ease: 'power1.out' }, '<');
    },
    { scope: root, dependencies: [phase] },
  );

  // Infinite tweens are not tracked by the hook's context once phase changes.
  React.useEffect(() => stopLoops, []);

  const busy = phase === 'loading' || phase === 'success';

  return (
    <button
      ref={root}
      aria-busy={busy || undefined}
      {...props}
      disabled={props.disabled || busy}
      className={cn(
        'group relative flex h-11 w-full items-center justify-center overflow-hidden rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground',
        'shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.1)] transition-colors duration-200',
        'hover:bg-primary/90',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-default',
        className,
      )}
    >
      {/* Glossy sweep on hover. */}
      <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 transition-[left,opacity] duration-700 group-hover:left-[110%] group-hover:opacity-100" />

      <span data-label className="relative flex items-center gap-2">
        {children}
        <ArrowRight className="size-[18px] transition-transform duration-200 group-hover:translate-x-1" strokeWidth={2} />
      </span>

      <span data-done className="invisible absolute inset-0 flex items-center justify-center gap-2 opacity-0">
        <span className="flex size-6 items-center justify-center rounded-full bg-white text-primary">
          <Check className="size-4" strokeWidth={2.8} />
        </span>
        {successLabel}
      </span>

      <span data-scene className="pointer-events-none invisible absolute inset-0 opacity-0" aria-hidden>
        <span
          data-road
          className="absolute inset-x-3 bottom-[7px] h-[2px] rounded-full opacity-60"
          style={{
            backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.9) 55%, transparent 0)',
            backgroundSize: '18px 2px',
          }}
        />
        <span data-truck className="absolute bottom-[8px] left-0 block h-[30px] w-[56px]">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              data-puff
              className="absolute bottom-[7px] left-[-4px] size-[7px] rounded-full bg-white/70 opacity-0"
            />
          ))}
          <TruckGraphic />
        </span>
      </span>

      <span className="sr-only" role="status">
        {phase === 'loading' ? 'Signing in…' : phase === 'success' ? successLabel : ''}
      </span>
    </button>
  );
}
