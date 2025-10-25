// ==BROWNIAN MOTION!!==
// Theme colors (single source of truth)
const DARK_BG  = [26, 26, 26];   // AlphaDark
const LIGHT_BG = [255, 255, 255];
const isDarkTheme = () => document.body.classList.contains('dark-mode');

function solidRepaint(p5) {
const c = isDarkTheme() ? DARK_BG : LIGHT_BG;
p5.background(c[0], c[1], c[2]); // opaque reset
}
function fadeStep(p5, alphaDark, alphaLight) {
const c = isDarkTheme() ? DARK_BG : LIGHT_BG;
const a = isDarkTheme() ? alphaDark : alphaLight;
p5.noStroke();
p5.fill(c[0], c[1], c[2], a);
p5.rect(0, 0, p5.width, p5.height);
}

// Config 
const CFG = {
walkers: 200,                // number of paths (auto-scales on small screens)
stepPxBase: 2,            // base step length (speed)
hopsPerFrame: 3,            // sub-steps per frame (speed multiplier)
strokeW: 2,                 // line thickness
lineAlpha: 0.4,            // path opacity (0..1)
fadeAlphaLight: 5,          // lower -> longer trails
fadeAlphaDark: 6,
outwardBoostFrames: 800,    // initial outward “burst” duration
outwardBoostStrength: 0.20, // 0..1 (0=no boost)
fps: 90
};

// State
const state = {
paused: false,
walkers: [],   // {x,y,px,py,color}
boostLeft: 0
};

// Color helper for paths
function colorFor(i) {
const hue = (i * 47) % 360;
return `hsla(${hue}, 65%, 52%, ${CFG.lineAlpha})`;
}

// Create/Reset walkers at center
function generate() {
state.walkers = [];
const count = (window.innerWidth < 576) ? Math.floor(CFG.walkers * 0.6) : CFG.walkers;
const cx = window.innerWidth / 2;
const cy = window.innerHeight / 2;
for (let i = 0; i < count; i++) {
    state.walkers.push({ x: cx, y: cy, px: cx, py: cy, color: colorFor(i) });
}
state.boostLeft = CFG.outwardBoostFrames;
}

// p5 sketch (stored on window for external repaint)
window._p5bg = new p5((s) => {
let stepPx = CFG.stepPxBase;

s.setup = () => {
    const cnv = s.createCanvas(window.innerWidth, window.innerHeight);
    cnv.style('position','fixed');
    cnv.style('top','0'); cnv.style('left','0');
    cnv.style('width','100vw'); cnv.style('height','100vh');
    cnv.style('z-index','-1');
    cnv.style('pointer-events','none'); // keep page clickable
    s.pixelDensity(1.5);
    s.frameRate(CFG.fps);
    recomputeStep();
    generate();
    solidRepaint(s); // first paint uses the same color as fading
};

s.windowResized = () => {
    s.resizeCanvas(window.innerWidth, window.innerHeight);
    recomputeStep();
    generate();
    solidRepaint(s);
};

function recomputeStep() {
    const scale = Math.min(s.width, s.height) / 800; // ~1 at 800px min-dim
    stepPx = Math.max(1.5, CFG.stepPxBase * Math.max(0.8, scale));
}

s.draw = () => {
    // Fading pass (keeps trails, matches solid color exactly)
    fadeStep(s, CFG.fadeAlphaDark, CFG.fadeAlphaLight);

    if (state.paused) return;

    const cx = s.width/2, cy = s.height/2;
    s.strokeWeight(CFG.strokeW);
    s.strokeCap(s.ROUND);

    for (let w of state.walkers) {
    for (let h = 0; h < CFG.hopsPerFrame; h++) {
        // propose a random unit step
        let vx = Math.cos(Math.random() * Math.PI * 2);
        let vy = Math.sin(Math.random() * Math.PI * 2);

        // outward “burst” early on to fill the page
        if (state.boostLeft > 0) {
        const dx = w.x - cx, dy = w.y - cy;
        const r = Math.hypot(dx, dy) || 1;
        const ux = dx / r, uy = dy / r;
        const a = 1 - CFG.outwardBoostStrength;
        vx = a * vx + (1 - a) * ux;
        vy = a * vy + (1 - a) * uy;
        const m = Math.hypot(vx, vy) || 1; vx /= m; vy /= m;
        }

        const nx = w.x + stepPx * vx;
        const ny = w.y + stepPx * vy;

        // wrap detection BEFORE drawing (prevents long cross-screen lines)
        let wrapped = false; let x2 = nx, y2 = ny;
        if (x2 < 0)          { x2 += s.width;  wrapped = true; }
        else if (x2 >= s.width){ x2 -= s.width;  wrapped = true; }
        if (y2 < 0)          { y2 += s.height; wrapped = true; }
        else if (y2 >= s.height){ y2 -= s.height; wrapped = true; }

        if (!wrapped) {
        s.stroke(w.color);
        s.line(w.x, w.y, x2, y2);
        w.px = w.x; w.py = w.y; w.x = x2; w.y = y2;
        } else {
        // jump across boundary without drawing the cross-screen segment
        w.x = x2; w.y = y2; w.px = w.x; w.py = w.y;
        }
    }
    }

    if (state.boostLeft > 0) state.boostLeft -= 1;

    // optional watermark
    s.noStroke(); s.fill(isDarkTheme()? 180 : 90); s.textSize(15);
    s.text('2D Brownian Motion', s.width - 160, 20);
};
});

// Repaint solid immediately whenever body.class changes (first load + toggles)
new MutationObserver(() => {
if (window._p5bg && window._p5bg._renderer) solidRepaint(window._p5bg);
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });
