/**
 * Embers and sparks behind the end-of-game banner.
 *
 * A 2D canvas rather than DOM nodes: a few hundred additive blobs cost one
 * canvas here, where the same thing in elements would be hundreds of composited
 * layers fighting the compositor every frame. `ui/` may not touch three.js, and
 * none of this needs it.
 */

import { useEffect, useRef } from 'react';

export type EmberTone = 'win' | 'loss' | 'draw';

interface Spec {
  /** Steady-state ember count — the bed is topped up as embers burn out. */
  count: number;
  /** One-off sparks thrown outward as the banner lands. */
  burst: number;
  /** Vertical drift in px/s. Negative rises, positive falls as ash. */
  drift: number;
  colors: [number, number, number][];
  /** Scales size and glow. */
  heat: number;
}

const TONE: Record<EmberTone, Spec> = {
  win: {
    count: 120,
    burst: 110,
    drift: -46,
    colors: [
      [255, 218, 150],
      [255, 166, 66],
      [255, 108, 38],
    ],
    heat: 1,
  },
  // Defeat still smoulders, but the fire is going out and the ash falls.
  loss: {
    count: 46,
    burst: 0,
    drift: 24,
    colors: [
      [196, 86, 62],
      [116, 118, 128],
    ],
    heat: 0.6,
  },
  draw: { count: 28, burst: 0, drift: -10, colors: [[154, 165, 179]], heat: 0.45 },
};

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: [number, number, number];
  /** Sideways sway, so embers do not rise on rails. */
  wobble: number;
  phase: number;
  /** Only sparks fall; embers are carried by the heat instead. */
  gravity: number;
}

export function EmberField({ tone }: { tone: EmberTone }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const spec = TONE[tone];
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    let width = 0;
    let height = 0;

    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const rand = (min: number, max: number) => min + Math.random() * (max - min);
    const pick = <T,>(values: T[]): T => values[Math.floor(Math.random() * values.length)];

    /**
     * @param seeded true for the opening frame, where the bed already has to
     *               look alight rather than starting from a bare screen.
     */
    function ember(seeded: boolean): Particle {
      // Three uniforms average into a rough bell curve, which bunches the embers
      // under the banner instead of spreading them evenly wall to wall.
      const bunch = (Math.random() + Math.random() + Math.random()) / 3 - 0.5;
      const max = rand(2.2, 5.2);
      const rising = spec.drift < 0;
      return {
        x: width / 2 + bunch * width * 1.15,
        y: rising
          ? seeded
            ? rand(height * 0.18, height + 20)
            : rand(height * 0.86, height + 24)
          : seeded
            ? rand(-20, height * 0.8)
            : rand(-30, -4),
        vx: rand(-14, 14),
        vy: spec.drift * rand(0.6, 1.5),
        life: seeded ? rand(0, max) : 0,
        max,
        size: rand(1.1, 3) * spec.heat + 0.4,
        color: pick(spec.colors),
        wobble: rand(10, 34),
        phase: rand(0, Math.PI * 2),
        gravity: 0,
      };
    }

    /** Thrown from the middle of the banner the moment it lands. */
    function spark(): Particle {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(170, 560);
      return {
        x: width / 2,
        y: height * 0.46,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.72,
        life: 0,
        max: rand(0.75, 1.5),
        size: rand(1.2, 2.6),
        color: pick(spec.colors),
        wobble: 0,
        phase: 0,
        gravity: 420,
      };
    }

    const particles: Particle[] = [];
    for (let i = 0; i < spec.count; i++) particles.push(ember(true));
    if (!reduced) for (let i = 0; i < spec.burst; i++) particles.push(spark());

    const step = (delta: number) => {
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += delta;

        if (p.life >= p.max) {
          // Sparks are one-shot; the ember bed burns continuously.
          if (p.gravity > 0) particles.splice(i, 1);
          else particles[i] = ember(false);
          continue;
        }

        p.vy += p.gravity * delta;
        p.x += (p.vx + Math.sin(p.life * 1.7 + p.phase) * p.wobble) * delta;
        p.y += p.vy * delta;

        const u = p.life / p.max;
        // Flares up quickly and dies away slowly, the way a real ember does.
        const alpha = Math.min(1, u * 6) * (1 - u) ** 1.4;
        const radius = p.size * (1 + u * 0.4) * 4;
        const [r, g, b] = p.color;

        const glow = context.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        glow.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        glow.addColorStop(0.35, `rgba(${r},${g},${b},${alpha * 0.35})`);
        glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
        context.fillStyle = glow;
        context.beginPath();
        context.arc(p.x, p.y, radius, 0, Math.PI * 2);
        context.fill();
      }
    };

    let frame = 0;
    if (reduced) {
      // One static frame: the banner still reads as lit, but nothing moves.
      step(0);
    } else {
      let previous = performance.now();
      const loop = (now: number) => {
        // Clamped so a stalled tab does not teleport every ember on resume.
        step(Math.min(0.05, (now - previous) / 1000));
        previous = now;
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [tone]);

  return <canvas ref={canvasRef} className="ember-field" aria-hidden />;
}
