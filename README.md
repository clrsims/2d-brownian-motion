# 2D Brownian Background (p5.js)
Ambient, theme‑aware background animation that renders colorful 2D random walks (Brownian motion) behind your webpage content. It supports dark/light mode, responsive sizing, toroidal edge wrapping (no long cross‑screen lines), and adjustable trail persistence.

> **Tech**: p5.js, HSLA colors, requestAnimationFrame via p5 draw loop, MutationObserver for theme sync.

---

## Demo

![Demo of 2D Brownian background](assets/demo.gif)

---

## How it works (high‑level)

Each “walker” takes small random unit steps in the plane each frame. We draw short line segments between successive positions. A faint, opaque‑color rectangle is painted every frame to fade older lines, producing smooth, persistent trails. On load there’s a brief **outward burst** so the canvas fills more quickly.

The canvas is fixed, full‑screen, and pointer‑events are disabled so the page stays interactive.

---

## Math background

### Random steps

Let (\theta \sim \mathrm{Unif}[0,2\pi)). A random unit step is
[ v = (\cos\theta,; \sin\theta). ]
With step length (s), the next position is
[ x_{t+1} = x_t + s,v_x, \qquad y_{t+1} = y_t + s,v_y. ]

### Outward burst (vector blending)

For the first `outwardBoostFrames`, we bias motion slightly away from the center (c). If (u_r) is the unit radial vector from center to the current point, we blend
[ v' = \alpha,v + (1-\alpha),u_r, \quad \alpha=1-\texttt{outwardBoostStrength}, ]
then renormalize (v') to unit length. This gently increases spatial coverage early without destroying randomness.

### Trail fading (exponential decay)

Each frame we paint a full‑screen rectangle in the **current theme background color** with small alpha (a) (0–255). This multiplies previous pixel intensities by roughly (1- a/255) each frame → an exponential decay. The trail’s intensity half‑life (in frames) is approximately
[ T_{1/2} \approx \frac{\ln 2}{-\ln(1-a/255)}. ]
For `fadeAlphaLight = 5`, (T_{1/2}\approx 35) frames; for `fadeAlphaDark = 6`, (T_{1/2}\approx 29) frames.

### Toroidal wrapping (no long lines)

We wrap positions modulo the canvas dimensions to emulate a torus:
[ x \leftarrow (x + W) \bmod W, \qquad y \leftarrow (y + H) \bmod H. ]
Crucially, we check wrap **before** drawing and suppress the cross‑screen segment so there are no long diagonal lines.

---

## Code tour

Below is the code with commentary organized by section (the original script is assumed to be included in your page after p5.js).

### Theme & repaint helpers

* **Single source of truth** for background RGB.
* `solidRepaint(p5)`: clears the entire canvas to the current theme bg (opaque).
* `fadeStep(p5, alphaDark, alphaLight)`: draws a translucent full‑screen rect for the exponential fade.

```js
const DARK_BG  = [26, 26, 26];   // AlphaDark
const LIGHT_BG = [255, 255, 255];
const isDarkTheme = () => document.body.classList.contains('dark-mode');

function solidRepaint(p5){
  const c = isDarkTheme() ? DARK_BG : LIGHT_BG;
  p5.background(c[0], c[1], c[2]);
}
function fadeStep(p5, alphaDark, alphaLight){
  const c = isDarkTheme() ? DARK_BG : LIGHT_BG;
  const a = isDarkTheme() ? alphaDark : alphaLight; // 0..255
  p5.noStroke();
  p5.fill(c[0], c[1], c[2], a);
  p5.rect(0, 0, p5.width, p5.height);
}
```

### Configuration & state

* `walkers`: path count (auto‑reduced on narrow screens).
* `hopsPerFrame`: sub‑steps per animation frame for smoother motion.
* `lineAlpha`: HSLA opacity for path strokes.
* `fadeAlphaLight/Dark`: lower → longer trails.
* `outwardBoost*`: early spatial coverage.

```js
const CFG = {
  walkers: 200,
  stepPxBase: 2,
  hopsPerFrame: 3,
  strokeW: 2,
  lineAlpha: 0.80,
  fadeAlphaLight: 5,
  fadeAlphaDark: 6,
  outwardBoostFrames: 800,
  outwardBoostStrength: 0.20,
  fps: 90
};

const state = {
  paused: false,
  walkers: [],      // {x,y,px,py,color}
  boostLeft: 0
};
```

### Coloring

Evenly spaced hues provide pleasant variety.

```js
function colorFor(i){
  const hue = (i * 47) % 360;
  return `hsla(${hue}, 65%, 52%, ${CFG.lineAlpha})`;
}
```

### Initialization

Create walkers at the canvas center and arm the outward boost.

```js
function generate(){
  state.walkers = [];
  const count = (window.innerWidth < 576) ? Math.floor(CFG.walkers * 0.6) : CFG.walkers;
  const cx = window.innerWidth/2, cy = window.innerHeight/2;
  for (let i=0; i<count; i++) state.walkers.push({ x: cx, y: cy, px: cx, py: cy, color: colorFor(i) });
  state.boostLeft = CFG.outwardBoostFrames;
}
```

### p5 sketch

* Full‑screen, fixed canvas with `pointer-events: none`.
* `pixelDensity(1.5)` balances crispness/perf (tune for your targets).
* `recomputeStep()` scales step size with min dimension so motion reads similarly on phones and desktops.

```js
window._p5bg = new p5((s)=>{
  let stepPx = CFG.stepPxBase;

  s.setup = () => {
    const cnv = s.createCanvas(window.innerWidth, window.innerHeight);
    cnv.style('position','fixed');
    cnv.style('top','0'); cnv.style('left','0');
    cnv.style('width','100vw'); cnv.style('height','100vh');
    cnv.style('z-index','-1');
    cnv.style('pointer-events','none');
    s.pixelDensity(1.5);
    s.frameRate(CFG.fps);
    recomputeStep();
    generate();
    solidRepaint(s); // match fade color immediately
  };

  s.windowResized = () => {
    s.resizeCanvas(window.innerWidth, window.innerHeight);
    recomputeStep();
    generate();
    solidRepaint(s);
  };

  function recomputeStep(){
    const scale = Math.min(s.width, s.height) / 800; // ~1 at 800px min
    stepPx = Math.max(1.5, CFG.stepPxBase * Math.max(0.8, scale));
  }
```

### Draw loop

1. **Fade pass** using current theme.
2. **Motion**: for each walker, do `hopsPerFrame` random steps, with optional outward boost.
3. **Wrapping**: apply modulo logic **before** drawing; skip the cross‑screen segment when wrapping.
4. **Watermark**: tiny label.

```js
  s.draw = () => {
    fadeStep(s, CFG.fadeAlphaDark, CFG.fadeAlphaLight);
    if (state.paused) return;

    const cx = s.width/2, cy = s.height/2;
    s.strokeWeight(CFG.strokeW);
    s.strokeCap(s.ROUND);

    for (let w of state.walkers){
      for (let h=0; h<CFG.hopsPerFrame; h++){
        // random unit vector
        let vx = Math.cos(Math.random()*Math.PI*2);
        let vy = Math.sin(Math.random()*Math.PI*2);

        // outward bias during initial frames
        if (state.boostLeft>0){
          const dx=w.x-cx, dy=w.y-cy; const r=Math.hypot(dx,dy)||1; const ux=dx/r, uy=dy/r;
          const a=1-CFG.outwardBoostStrength; // blend weight
          vx = a*vx + (1-a)*ux; vy = a*vy + (1-a)*uy; // blend
          const m=Math.hypot(vx,vy)||1; vx/=m; vy/=m; // renorm
        }

        // propose next point
        const nx = w.x + stepPx*vx; const ny = w.y + stepPx*vy;

        // wrap BEFORE drawing to avoid long cross-screen lines
        let wrapped=false; let x2=nx, y2=ny;
        if (x2<0){ x2+=s.width; wrapped=true; }
        else if (x2>=s.width){ x2-=s.width; wrapped=true; }
        if (y2<0){ y2+=s.height; wrapped=true; }
        else if (y2>=s.height){ y2-=s.height; wrapped=true; }

        if (!wrapped){
          s.stroke(w.color);
          s.line(w.x, w.y, x2, y2);
          w.px=w.x; w.py=w.y; w.x=x2; w.y=y2;
        } else {
          // teleport across boundary without drawing the cross-screen segment
          w.x=x2; w.y=y2; w.px=w.x; w.py=w.y;
        }
      }
    }

    if (state.boostLeft>0) state.boostLeft -= 1;

    s.noStroke(); s.fill(isDarkTheme()? 180 : 90); s.textSize(15);
    s.text('2D Brownian Motion', s.width-160, 20);
  };
});
```

### Theme sync

Any time the page toggles `body.dark-mode`, we immediately repaint the canvas **solid** to the new base color so the fade pass matches and there’s no color lag.

```js
new MutationObserver(()=>{
  if (window._p5bg && window._p5bg._renderer) solidRepaint(window._p5bg);
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });
```

---

## Installation

1. Include p5.js in your page (CDN or local).
2. Paste the script from this repo after p5.js and before `</body>`.
3. Make sure your theme toggle adds/removes `dark-mode` on `<body>`.

```html
<body class="light-mode">
  <!-- page content -->
  <script src="https://cdn.jsdelivr.net/npm/p5@1.9.2/lib/p5.min.js"></script>
  <script src="/path/to/brownian-bg.js"></script>
</body>
```

---

## Configuration guide

| Key                    | Meaning                      | Typical values | Notes                              |
| ---------------------- | ---------------------------- | -------------: | ---------------------------------- |
| `walkers`              | Number of paths              |        100–400 | Auto‑reduced on very small screens |
| `stepPxBase`           | Base step size (px)          |          1.5–3 | Scaled by canvas size              |
| `hopsPerFrame`         | Sub‑steps per frame          |            1–5 | Higher = smoother but costlier     |
| `strokeW`              | Line thickness               |            1–3 | Aesthetic                          |
| `lineAlpha`            | Stroke opacity (0–1)         |        0.4–0.9 | HSLA alpha for line color          |
| `fadeAlphaLight/Dark`  | Fade rectangle alpha (0–255) |           3–10 | Lower → longer trails              |
| `outwardBoostFrames`   | Burst duration (frames)      |       200–1200 | 0 disables burst                   |
| `outwardBoostStrength` | Blend toward radial (0–1)    |        0.1–0.4 | 0 = no bias                        |
| `fps`                  | Target frame rate            |          60–90 | p5 tries to honor this             |

**Trail half‑life cheat sheet** (approx):

* alpha=4 → T½≈44 frames
* alpha=5 → T½≈35 frames
* alpha=6 → T½≈29 frames

---

## Performance tips

* Lower `walkers` and/or `hopsPerFrame` on mobile.
* Prefer `strokeCap(ROUND)` to keep thin lines visually smooth.
* If CPU bound, reduce `fps` or `pixelDensity()`.
* Avoid huge canvases inside iframes; the sketch is full‑screen already.

---

## Extending

* **Shapes**: draw points or splines instead of lines.
* **Fields**: replace the uniform angle with a vector field (Perlin noise flow).
* **Collisions**: bounce on margins instead of wrap for a box feel.
* **Interactivity**: bias steps toward the cursor.

---

## Troubleshooting

* **Background looks darker on first load than after toggling**: Ensure you call `solidRepaint` on setup and after `windowResized`, and that your theme toggle mutates `body.classList` (the `MutationObserver` depends on this). Also verify your CSS doesn’t overlay additional translucent layers.
* **No canvas / canvas covers content**: The sketch sets `z-index:-1` and `pointer-events:none`. Check parent stacking contexts and any positioned ancestors.
* **Jagged lines on high‑DPI screens**: increase `pixelDensity` or lower `strokeW`.

---

## License

MIT

---

## Acknowledgments

Inspired by classical Brownian motion visualizations and Daniel Shiffman’s p5.js community.
