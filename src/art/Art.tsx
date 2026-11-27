import type { Art as ArtSpec, SchmearFlavor } from '../domain/menu';
import { mulberry32 } from '../domain/rush';

// The menu's pictures, drawn like a sign painter's set: flat color, one ink outline weight, one
// highlight per object, no gradients. Every scatter of seeds is seeded, so a bagel looks the same
// every time it is drawn.

const INK = '#1b1611';
const W = 2.6;
const DOUGH = '#d99a45';
const DOUGH_TOP = '#eab868';
const DOUGH_DARK = '#b97a35';

interface Pt {
  x: number;
  y: number;
  r: number;
}

/** Points on the top face of the ring, between the hole and the rim. */
function ringPoints(seed: number, n: number, cx = 32, cy = 33): Pt[] {
  const rng = mulberry32(seed);
  const pts: Pt[] = [];
  let guard = 0;
  while (pts.length < n && guard++ < n * 30) {
    const a = rng() * Math.PI * 2;
    const t = 0.18 + rng() * 0.64;
    const rx = 9 + t * 15.5;
    const ry = 6.5 + t * 12;
    const x = cx + Math.cos(a) * rx;
    const y = cy - 1 + Math.sin(a) * ry;
    if (pts.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 6)) continue;
    pts.push({ x, y, r: a });
  }
  return pts;
}

const SESAME = ringPoints(11, 30);
const POPPY = ringPoints(23, 60);
const EVERY_SESAME = ringPoints(31, 14);
const EVERY_POPPY = ringPoints(37, 26);
const EVERY_FLAKE = ringPoints(41, 9);
const RAISINS = ringPoints(53, 7);

function Seed({ p, fill }: { p: Pt; fill: string }) {
  return (
    <ellipse
      cx={p.x.toFixed(2)}
      cy={p.y.toFixed(2)}
      rx="1.5"
      ry="0.8"
      fill={fill}
      transform={`rotate(${((p.r * 180) / Math.PI).toFixed(0)} ${p.x.toFixed(2)} ${p.y.toFixed(2)})`}
    />
  );
}

function Bagel({ topping }: { topping: 'plain' | 'sesame' | 'poppy' | 'everything' | 'cinnamon' }) {
  const dough = topping === 'cinnamon' ? '#c98a4b' : DOUGH;
  const top = topping === 'cinnamon' ? '#dcaa70' : DOUGH_TOP;
  return (
    <g>
      {/* Side of the ring, then the top face, then the hole. */}
      <ellipse cx="32" cy="36" rx="27" ry="20.5" fill={DOUGH_DARK} stroke={INK} stroke-width={W} />
      <ellipse cx="32" cy="32.5" rx="26" ry="19" fill={dough} />
      <path d="M12 27 C 17 17, 35 13, 47 18" fill="none" stroke={top} stroke-width="5" stroke-linecap="round" />
      {topping === 'cinnamon' && (
        <g fill="none" stroke="#8a5328" stroke-width="1.8" stroke-linecap="round">
          <path d="M14 36 C 20 46, 44 47, 51 38" />
          <path d="M18 29 C 24 23, 41 22, 47 29" />
          <path d="M20 42 C 28 49, 40 48, 46 43" opacity="0.7" />
        </g>
      )}
      {topping === 'sesame' && SESAME.map((p) => <Seed p={p} fill="#fbefcc" />)}
      {topping === 'poppy' && POPPY.map((p) => <circle cx={p.x.toFixed(2)} cy={p.y.toFixed(2)} r="0.95" fill={INK} />)}
      {topping === 'everything' && (
        <g>
          {EVERY_FLAKE.map((p, i) => (
            <rect
              x={(p.x - 1.4).toFixed(2)}
              y={(p.y - 1).toFixed(2)}
              width="2.8"
              height="2"
              rx="0.6"
              fill={i % 3 === 0 ? '#fffaf0' : '#f4dfae'}
              transform={`rotate(${(i * 37) % 90} ${p.x.toFixed(2)} ${p.y.toFixed(2)})`}
            />
          ))}
          {EVERY_SESAME.map((p) => <Seed p={p} fill="#fbefcc" />)}
          {EVERY_POPPY.map((p) => <circle cx={p.x.toFixed(2)} cy={p.y.toFixed(2)} r="0.9" fill={INK} />)}
        </g>
      )}
      {topping === 'cinnamon' &&
        RAISINS.map((p) => (
          <ellipse cx={p.x.toFixed(2)} cy={p.y.toFixed(2)} rx="2" ry="1.5" fill="#4b2a26" />
        ))}
      <ellipse cx="32" cy="32.5" rx="26" ry="19" fill="none" stroke={INK} stroke-width={W} />
      <ellipse cx="32" cy="31" rx="7.5" ry="5" fill="#8f5a24" stroke={INK} stroke-width={W} />
      <path d="M25.5 32.5 C 28 35.5, 36 35.5, 38.5 32.5" fill="none" stroke={INK} stroke-width="1.4" opacity="0.5" />
    </g>
  );
}

const SCHMEAR: Record<SchmearFlavor, { base: string; line: string; band: string; fleck: string[] }> = {
  plain: { base: '#fffaf0', line: '#e3d8c2', band: '#f6d87a', fleck: [] },
  scallion: { base: '#f5f3df', line: '#d6d3b6', band: '#5d8f3e', fleck: ['#4f8a3a', '#6fa84b'] },
  veggie: { base: '#fbefe1', line: '#e8d3bb', band: '#e0712c', fleck: ['#e0712c', '#c8321e', '#4f8a3a'] },
  honey: { base: '#f3d995', line: '#d6b263', band: '#9a5f2a', fleck: ['#8a5328', '#6b3d1c'] },
};

const FLECKS: Pt[] = (() => {
  const rng = mulberry32(71);
  const out: Pt[] = [];
  for (let i = 0; i < 40 && out.length < 11; i++) {
    const x = 18 + rng() * 29;
    const y = 18 + rng() * 12;
    if (y < 31 - Math.abs(x - 32) * 0.25 && !out.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < 9)) out.push({ x, y, r: rng() * 3 });
  }
  return out;
})();

function Schmear({ flavor }: { flavor: SchmearFlavor }) {
  const c = SCHMEAR[flavor];
  return (
    <g stroke-linejoin="round">
      {/* A deli tub, heaped and swirled with a knife. */}
      <path d="M15 34 L 49 34 L 45.5 56 C 45.2 57.4, 44.4 58, 43 58 L 21 58 C 19.6 58, 18.8 57.4, 18.5 56 Z" fill="#fffdf7" stroke={INK} stroke-width={W} />
      <path d="M16.3 42 L 47.7 42 L 46.4 50 L 17.6 50 Z" fill={c.band} />
      <path d="M16.3 42 L 47.7 42 M 17.6 50 L 46.4 50" stroke={INK} stroke-width="1.6" />
      <path d="M21 52 L 21.6 55.5" stroke="#efe6d6" stroke-width="2.2" stroke-linecap="round" />
      <path
        d="M14 33 C 12 26, 18 21, 24 22 C 25 15, 34 12, 39 17 C 45 15, 52 21, 50 27 C 53 29, 52 33, 50 33 Z"
        fill={c.base}
        stroke={INK}
        stroke-width={W}
      />
      <path d="M18 29 C 24 32, 42 32, 47 27 C 49 23, 43 20, 37 22 C 31 24, 30 28, 35 28" fill="none" stroke={c.line} stroke-width="2.3" stroke-linecap="round" />
      <path d="M33 14.5 C 35 11, 39.5 11.5, 39 15.5" fill={c.base} stroke={INK} stroke-width="2.2" stroke-linecap="round" />
      <path d="M22 25 C 24 22.5, 27 21.6, 29.5 22" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" />
      {FLECKS.map((p, i) =>
        c.fleck.length ? (
          <rect
            x={(p.x - 1.1).toFixed(2)}
            y={(p.y - 0.7).toFixed(2)}
            width="2.3"
            height="1.4"
            rx="0.5"
            fill={c.fleck[i % c.fleck.length]}
            transform={`rotate(${(i * 53) % 180} ${p.x.toFixed(2)} ${p.y.toFixed(2)})`}
          />
        ) : null,
      )}
      <rect x="12" y="31.5" width="40" height="5" rx="2.5" fill="#fffdf7" stroke={INK} stroke-width={W} />
    </g>
  );
}

function Sandwich({ filling }: { filling: 'lox' | 'egg' | 'whitefish' }) {
  return (
    <g stroke-linejoin="round">
      {/* Bottom half */}
      <path d="M9 45 C 9 54, 55 54, 55 45 L 55 43 L 9 43 Z" fill={DOUGH} stroke={INK} stroke-width={W} />
      {filling === 'lox' && (
        <g>
          <path d="M7 43.5 C 12 39.5, 52 39.5, 57 43.5 C 50 46.5, 14 46.5, 7 43.5 Z" fill="#fffaf0" stroke={INK} stroke-width="2" />
          <path d="M5 39 C 5 34, 13 34, 13 39 Z" fill="#d9452b" stroke={INK} stroke-width="2" />
          <path d="M51 39 C 51 34, 59 34, 59 39 Z" fill="#d9452b" stroke={INK} stroke-width="2" />
          <path
            d="M8 41 C 11 35, 16 38, 20 34.5 C 24 38.5, 29 34, 33 37 C 37 33.5, 42 38, 46 34.5 C 50 37.5, 54 35, 57 38 L 56 41.5 C 40 43, 24 43, 8 41 Z"
            fill="#f08a73"
            stroke={INK}
            stroke-width="2"
          />
          <path d="M14 38.5 C 17 37.5, 20 37.5, 23 38.5 M 29 38.8 C 32 37.8, 35 37.8, 38 38.8 M 44 38.5 C 47 37.5, 49 37.5, 52 38.5" fill="none" stroke="#fbd3c7" stroke-width="1.5" stroke-linecap="round" />
          <ellipse cx="26" cy="36" rx="5" ry="2.2" fill="none" stroke="#8e3d86" stroke-width="2" />
          <circle cx="38" cy="36.5" r="1.3" fill="#557a2c" />
          <circle cx="42" cy="38" r="1.3" fill="#557a2c" />
          <circle cx="17" cy="38" r="1.3" fill="#557a2c" />
        </g>
      )}
      {filling === 'egg' && (
        <g>
          <path
            d="M6 42 C 7 35, 14 38, 18 34 C 23 38, 29 33, 34 36 C 39 32, 45 37, 49 34 C 54 35, 58 37, 58 42 Z"
            fill="#f7cf3d"
            stroke={INK}
            stroke-width="2"
          />
          <path d="M19 41 L 45 41 L 49 49 L 41 43.5 L 23 43.5 Z" fill="#f29a1f" stroke={INK} stroke-width="2" />
          <path d="M14 37.5 C 16.5 36.5, 19 36.5, 21 37.5 M 36 37 C 38 36, 41 36, 43 37" fill="none" stroke="#fff3b5" stroke-width="1.7" stroke-linecap="round" />
        </g>
      )}
      {filling === 'whitefish' && (
        <g>
          <path
            d="M6 42 C 9 37, 13 41, 16 37 C 20 41, 24 36, 28 40 C 32 36, 37 41, 41 37 C 45 41, 50 36, 58 41 L 56 43 L 8 43 Z"
            fill="#7fb04a"
            stroke={INK}
            stroke-width="2"
          />
          <path d="M12 38 C 14 30, 50 30, 52 38 C 40 40, 24 40, 12 38 Z" fill="#efe3c6" stroke={INK} stroke-width="2" />
          <circle cx="23" cy="35" r="0.95" fill="#a8946a" />
          <circle cx="31" cy="33.5" r="0.95" fill="#a8946a" />
          <circle cx="40" cy="35" r="0.95" fill="#a8946a" />
          <path d="M5 41 C 5 37, 11 37, 11 41 Z" fill="#d9452b" stroke={INK} stroke-width="2" />
        </g>
      )}
      {/* Top half with seeds */}
      <path d="M8 31 C 8 13, 56 13, 56 31 C 56 34.5, 8 34.5, 8 31 Z" fill={DOUGH} stroke={INK} stroke-width={W} />
      <path d="M15 22 C 22 16.5, 34 15.5, 42 17.5" fill="none" stroke={DOUGH_TOP} stroke-width="3.6" stroke-linecap="round" />
      {[
        [19, 25, -20],
        [27, 21, 10],
        [36, 20.5, -10],
        [45, 24, 25],
        [23, 29, 30],
        [41, 28.5, -30],
        [32, 26, 0],
        [49, 29, 15],
      ].map(([x, y, r]) => (
        <ellipse cx={x} cy={y} rx="1.6" ry="0.85" fill="#fbefcc" transform={`rotate(${r} ${x} ${y})`} />
      ))}
    </g>
  );
}

function Cup({ style }: { style: 'drip' | 'latte' | 'cold' }) {
  if (style === 'latte')
    return (
      <g stroke-linejoin="round">
        <path d="M45 32 C 56 30, 57 45, 45 45" fill="none" stroke={INK} stroke-width="5.6" />
        <path d="M45 32 C 56 30, 57 45, 45 45" fill="none" stroke="#fffdf7" stroke-width="2" />
        <path d="M10 27 L 50 27 C 50 44, 44 54, 30 54 C 16 54, 10 44, 10 27 Z" fill="#fffdf7" stroke={INK} stroke-width={W} />
        <path d="M14 36 C 15 44, 20 49, 28 50" fill="none" stroke="#efe6d6" stroke-width="3" stroke-linecap="round" />
        <ellipse cx="30" cy="27" rx="20" ry="6" fill="#c8945c" stroke={INK} stroke-width={W} />
        <path d="M30 31 C 22 27, 23 22.5, 27 23 C 28.6 23.2, 29.6 24.4, 30 25.4 C 30.4 24.4, 31.4 23.2, 33 23 C 37 22.5, 38 27, 30 31 Z" fill="#fff5e2" />
        <path d="M30 26 L 30 30" stroke="#c8945c" stroke-width="1.2" stroke-linecap="round" />
        <path d="M22 18 C 20 15, 24 13, 22 9 M 30 17 C 28 14, 32 12, 30 8 M 38 18 C 36 15, 40 13, 38 9" fill="none" stroke={INK} stroke-width="2" stroke-linecap="round" opacity="0.55" />
      </g>
    );
  if (style === 'cold')
    return (
      <g stroke-linejoin="round">
        <path d="M37 4 L 33 26" stroke={INK} stroke-width="5.4" stroke-linecap="round" />
        <path d="M37 4 L 33 26" stroke="#c8321e" stroke-width="2.4" stroke-linecap="round" />
        <path d="M15 18 L 49 18 L 45 58 L 19 58 Z" fill="#f4ede2" stroke={INK} stroke-width={W} />
        <path d="M16.6 30 L 47.4 30 L 45 58 L 19 58 Z" fill="#6b4126" />
        <path d="M16.6 30 L 47.4 30" stroke={INK} stroke-width="1.6" />
        <rect x="21" y="26" width="9" height="8" rx="1.6" fill="#f6fbff" stroke={INK} stroke-width="1.8" transform="rotate(-12 25 30)" />
        <rect x="32" y="27.5" width="9" height="8" rx="1.6" fill="#f6fbff" stroke={INK} stroke-width="1.8" transform="rotate(14 36 31)" />
        <path d="M22 40 L 23 52" stroke="#8a5a39" stroke-width="2.4" stroke-linecap="round" />
        <path d="M13 18 L 51 18" stroke={INK} stroke-width="4" stroke-linecap="round" />
      </g>
    );
  return (
    <g stroke-linejoin="round">
      <path d="M17 18 L 47 18 L 43 58 L 21 58 Z" fill="#fffdf7" stroke={INK} stroke-width={W} />
      <path d="M18.4 31 L 45.6 31 L 44.3 45 L 19.7 45 Z" fill="#c8321e" stroke={INK} stroke-width={W} />
      {/* A poppy on the sleeve: four petals and a dark middle. */}
      <g transform="translate(32 38)">
        <circle cx="-2.4" cy="-2" r="2.6" fill="#f6d87a" />
        <circle cx="2.4" cy="-2" r="2.6" fill="#f6d87a" />
        <circle cx="-2.4" cy="2" r="2.6" fill="#f6d87a" />
        <circle cx="2.4" cy="2" r="2.6" fill="#f6d87a" />
        <circle r="1.6" fill={INK} />
      </g>
      <path d="M14 18 C 14 13, 50 13, 50 18 L 50 20 L 14 20 Z" fill={INK} />
      <path d="M19 13.5 C 21 9, 43 9, 45 13.5 Z" fill={INK} />
      <path d="M22 49 L 22.8 55" stroke="#efe6d6" stroke-width="2.4" stroke-linecap="round" />
    </g>
  );
}

export function ItemArt({ art, size = 64, title }: { art: ArtSpec; size?: number; title?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      class="art"
    >
      {title && <title>{title}</title>}
      {art.kind === 'bagel' && <Bagel topping={art.topping} />}
      {art.kind === 'schmear' && <Schmear flavor={art.flavor} />}
      {art.kind === 'sandwich' && <Sandwich filling={art.filling} />}
      {art.kind === 'cup' && <Cup style={art.style} />}
    </svg>
  );
}

/** The shop's mark: a poppy seed bagel. Also the favicon. */
export function Mark({ size = 40 }: { size?: number }) {
  return <ItemArt art={{ kind: 'bagel', topping: 'poppy' }} size={size} />;
}
