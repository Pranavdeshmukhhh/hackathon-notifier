/**
 * MotionKit.jsx — Animation primitives built on `motion/react`.
 *
 *  - <CursorSpotlight/>  soft aurora glow that trails the pointer
 *  - <TiltCard/>         spring-driven 3D tilt + sheen on hover, staggered entrance
 *  - <ScrollBar/>        thin gradient progress bar tied to page scroll
 *
 * Everything degrades to static rendering for users who prefer reduced motion
 * and on touch devices (no hover / coarse pointer).
 */

import React, { useEffect, useState } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useScroll,
  useMotionTemplate,
  useReducedMotion,
} from 'motion/react';

const canHover = () =>
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export function CursorSpotlight() {
  const reduce = useReducedMotion();
  const [hoverCapable] = useState(canHover);
  const enabled = hoverCapable && !reduce;
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const sx = useSpring(x, { stiffness: 120, damping: 20, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 120, damping: 20, mass: 0.6 });
  const background = useMotionTemplate`radial-gradient(420px circle at ${sx}px ${sy}px, rgba(99,102,241,0.14), rgba(236,72,153,0.07) 40%, transparent 70%)`;

  useEffect(() => {
    if (!enabled) return undefined;
    const move = (e) => { x.set(e.clientX); y.set(e.clientY); };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [enabled, x, y]);

  if (!enabled) return null;
  return (
    <motion.div
      aria-hidden="true"
      style={{ background }}
      className="pointer-events-none fixed inset-0 z-[1] mix-blend-screen"
    />
  );
}

export function TiltCard({ children, index = 0, className = '' }) {
  const reduce = useReducedMotion();
  const [tiltOn] = useState(canHover);
  const [hovered, setHovered] = useState(false);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 220, damping: 22, mass: 0.5 };
  const rotateY = useSpring(useTransform(px, [0, 1], [-5, 5]), spring);
  const rotateX = useSpring(useTransform(py, [0, 1], [5, -5]), spring);
  const sheen = useMotionTemplate`radial-gradient(260px circle at ${useTransform(px, (v) => v * 100)}% ${useTransform(py, (v) => v * 100)}%, rgba(255,255,255,0.10), transparent 60%)`;

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const onLeave = () => { px.set(0.5); py.set(0.5); setHovered(false); };

  const entrance = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 28, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, scale: 0.96 },
        transition: {
          type: 'spring',
          stiffness: 260,
          damping: 26,
          delay: Math.min(index * 0.035, 0.35),
        },
      };

  return (
    <motion.div
      layout={!reduce}
      {...entrance}
      onPointerMove={tiltOn && !reduce ? onMove : undefined}
      onPointerEnter={tiltOn && !reduce ? () => setHovered(true) : undefined}
      onPointerLeave={tiltOn && !reduce ? onLeave : undefined}
      style={tiltOn && !reduce ? { rotateX, rotateY, transformPerspective: 900 } : undefined}
      whileHover={tiltOn && !reduce ? { y: -4 } : undefined}
      className={`relative ${className}`}
    >
      {children}
      {tiltOn && !reduce && (
        <motion.span
          aria-hidden="true"
          style={{ background: sheen }}
          animate={{ opacity: hovered ? 1 : 0 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none absolute inset-0"
        />
      )}
    </motion.div>
  );
}

export function CountUp({ value, format = (n) => String(n) }) {
  const reduce = useReducedMotion();
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(target);
  const fromRef = React.useRef(target);

  useEffect(() => {
    if (reduce) {
      fromRef.current = target;
      return undefined;
    }
    const controls = animate(fromRef.current, target, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { fromRef.current = v; setDisplay(Math.round(v)); },
    });
    return () => controls.stop();
  }, [target, reduce]);

  return <>{format(reduce ? target : display)}</>;
}

export function ScrollBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 28, restDelta: 0.001 });
  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX, transformOrigin: '0% 50%' }}
      className="fixed top-0 left-0 right-0 h-[2px] z-[60] bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-400"
    />
  );
}
