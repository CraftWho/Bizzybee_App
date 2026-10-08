console.log("/// MECH BEE MODULE ONLINE ///");

// MechBee - the small mech bee used around the hive (colony exterior), plus
// an action engine that moves bees around an SVG scene. Bees always face the
// way they are moving. Approved by the user on the hive-exterior concept
// page (Oct 2026). Any page can use it: load mech-bee.css + mech-bee.js.
//
// Quick start:
//   const scene = new MechBeeScene(svgEl, { front: frontGroup, back: backGroup });
//   scene.orbit({ cx: 200, y: 260, rx: 150, ry: 30, speed: 0.6, bee: { stripe: '#2f9bff' }, label: 'Glimmer', onClick: () => {} });
//   scene.leaveHive({ from: { x: 200, y: 330 } });        // returns a Promise
//   scene.returnHive({ to: { x: 200, y: 330 } });         // carries pollen by default
//   scene.autoForage({ entrance: { x: 200, y: 330 } });   // random leave/return trips
//   scene.start();  ...  scene.destroy();
//
// Coordinates are in the SVG's own user units (its viewBox). The bee art
// faces LEFT with its origin at the body centre; the engine mirrors it when
// it moves right.

const MechBee = {
    // Stripe colours by element - same tints as the card's gold parts.
    ELEMENT_STRIPES: { fire: '#ff5a1f', water: '#2f9bff', earth: '#4fb83a', wind: '#5fe0cc' },
    DEFAULT_STRIPE: '#e0b02a',

    stripeFor(element) {
        return this.ELEMENT_STRIPES[element] || this.DEFAULT_STRIPE;
    },

    // SVG markup for one bee (a <g>). opts: scale, stripe, eye, pollen.
    markup({ scale = 1, stripe = this.DEFAULT_STRIPE, eye = '#5fd6ff', pollen = false } = {}) {
        return `<g class="mech-bee-art" transform="scale(${scale})">
            <ellipse class="mb-wing" cx="2" cy="-7" rx="6" ry="9" fill="rgba(210,230,245,.55)" stroke="#1a1a1a" stroke-width=".8" transform="rotate(20 2 -7)"/>
            <ellipse cx="6" cy="1" rx="8" ry="5.5" fill="#1b1b1e" stroke="#0b0b0b" stroke-width="1"/>
            <path d="M3 -4.5v11M7.5 -4.8v11" stroke="${stripe}" stroke-width="2.2"/>
            <circle cx="-4" cy="0" r="4.6" fill="#1b1b1e" stroke="#0b0b0b"/>
            <circle cx="-5.5" cy="-1" r="2" fill="${eye}"/>
            <path d="M-6 -4l-3 -5M-4 -4.5l-1 -5.5" stroke="#111" stroke-width=".9"/>
            ${pollen ? '<circle class="mb-pollen" cx="3" cy="6.5" r="2.6" fill="#ffd23f" stroke="#a07000" stroke-width=".6"/><circle class="mb-pollen" cx="8.5" cy="6" r="2.3" fill="#ffd23f" stroke="#a07000" stroke-width=".6"/>' : ''}
        </g>`;
    },

    // Builds an actor element: an outer <g> (position) holding the bee <g>
    // (mirroring) and an optional name label that never mirrors.
    // onClick: makes the bee tappable (adds an invisible, larger hit circle).
    create(parent, { bee = {}, label = '', labelColor = '#fff', onClick = null } = {}) {
        const NS = 'http://www.w3.org/2000/svg';
        const wrap = document.createElementNS(NS, 'g');
        wrap.setAttribute('class', onClick ? 'mech-bee is-tappable' : 'mech-bee');
        if (onClick) {
            const hit = document.createElementNS(NS, 'circle');
            hit.setAttribute('r', String(14 * (bee.scale || 1) + 4));
            hit.setAttribute('class', 'mech-bee-hit');
            wrap.appendChild(hit);
            wrap.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
        }
        const body = document.createElementNS(NS, 'g');
        body.innerHTML = this.markup(bee);
        wrap.appendChild(body);
        if (label) {
            const text = document.createElementNS(NS, 'text');
            text.setAttribute('class', 'mech-bee-label');
            text.setAttribute('y', String(-14 * (bee.scale || 1) - 3));
            text.setAttribute('fill', labelColor);
            text.textContent = label;
            wrap.appendChild(text);
        }
        parent.appendChild(wrap);
        return { wrap, body };
    },

    // Positions an actor. faceRight mirrors the bee; scale/opacity optional.
    place(actorEl, x, y, { faceRight = false, scale = 1, tilt = 0, opacity = 1 } = {}) {
        actorEl.wrap.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(3)})`);
        actorEl.body.setAttribute('transform', `${faceRight ? 'scale(-1 1) ' : ''}rotate(${(faceRight ? -tilt : tilt).toFixed(1)})`);
        actorEl.wrap.style.opacity = opacity;
    },

    bezier(p0, p1, p2, p3, t) {
        const u = 1 - t;
        return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    }
};

// Drives every bee in one SVG with a single requestAnimationFrame loop.
// front / back: <g> layers inside the SVG. Orbiting bees switch between
// them so the far half of a loop passes behind whatever sits in between
// (e.g. the hive). timeScale < 1 slows everything (handy for testing).
class MechBeeScene {
    constructor(svg, { front, back = null, timeScale = 1 } = {}) {
        this.svg = svg;
        this.front = front;
        this.back = back || front;
        this.timeScale = timeScale;
        this.actors = new Set();
        this.raf = null;
        this.time = 0;
        this.last = 0;
        this.forage = null;
        this.reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    _add(actor) {
        this.actors.add(actor);
        if (this.reduceMotion) actor.update(0, 0);
        return actor;
    }

    _remove(actor) {
        this.actors.delete(actor);
        if (actor.el) actor.el.wrap.remove();
    }

    // ---- ACTIONS ---------------------------------------------------------

    // Loops around a centre point. Far half of the loop goes to the back layer.
    orbit({ cx, y, rx, ry, speed = 0.6, phase = Math.random() * Math.PI * 2, bee = {}, label = '', labelColor, onClick = null } = {}) {
        const el = MechBee.create(this.front, { bee, label, labelColor, onClick });
        let th = phase;
        return this._add({
            kind: 'orbit', el,
            update: (dt) => {
                th += speed * dt;
                const x = cx + rx * Math.cos(th), yy = y + ry * Math.sin(th);
                const inFront = Math.sin(th) > 0;
                const layer = inFront ? this.front : this.back;
                if (el.wrap.parentNode !== layer) layer.appendChild(el.wrap);
                const vx = -rx * Math.sin(th) * speed;
                MechBee.place(el, x, yy, { faceRight: vx > 0, scale: inFront ? 1 : 0.85, opacity: inFront ? 1 : 0.65, tilt: Math.cos(th) * speed * 6 });
            }
        });
    }

    // Hovers in place with a gentle drift, turning now and then.
    hover({ x, y, amp = 6, bee = {}, label = '' } = {}) {
        const el = MechBee.create(this.front, { bee, label });
        const ph = Math.random() * 10;
        return this._add({
            kind: 'hover', el,
            update: (dt, t) => {
                const dx = Math.sin(t * 0.7 + ph) * amp * 1.6, dy = Math.sin(t * 1.9 + ph) * amp;
                MechBee.place(el, x + dx, y + dy, { faceRight: Math.cos(t * 0.7 + ph) > 0 });
            }
        });
    }

    // Paces back and forth on a surface (e.g. the landing deck).
    walk({ x, y, range = 16, speed = 0.8, bee = {}, label = '' } = {}) {
        const el = MechBee.create(this.front, { bee, label });
        const ph = Math.random() * 10;
        return this._add({
            kind: 'walk', el,
            update: (dt, t) => {
                const a = t * speed + ph;
                MechBee.place(el, x + range * Math.sin(a), y + Math.abs(Math.sin(a * 4)) * -0.8, { faceRight: Math.cos(a) > 0 });
            }
        });
    }

    // Flies along a curve from A to B. Resolves when it arrives.
    // shrinkAt: 'start' | 'end' | null - fade/shrink into a hole at that end.
    flyPath({ from, to, c1, c2, duration = 3.6, bee = {}, shrinkAt = null, keep = false } = {}) {
        const el = MechBee.create(this.front, { bee });
        c1 = c1 || { x: from.x + (to.x - from.x) * 0.25, y: from.y + 30 };
        c2 = c2 || { x: from.x + (to.x - from.x) * 0.7, y: to.y + 50 };
        let p = 0;
        return new Promise(resolve => {
            const actor = {
                kind: 'path', el,
                update: (dt) => {
                    p = Math.min(1, p + dt / duration);
                    const x = MechBee.bezier(from.x, c1.x, c2.x, to.x, p), y = MechBee.bezier(from.y, c1.y, c2.y, to.y, p);
                    const nx = MechBee.bezier(from.x, c1.x, c2.x, to.x, Math.min(1, p + 0.01));
                    let s = 1;
                    if (shrinkAt === 'start') s = Math.min(1, p / 0.12);
                    if (shrinkAt === 'end') s = Math.min(1, (1 - p) / 0.12);
                    MechBee.place(el, x, y, { faceRight: nx > x, scale: 0.35 + 0.65 * s, opacity: s });
                    if (p >= 1) {
                        if (keep) { this.actors.delete(actor); resolve(el); }
                        else { this._remove(actor); resolve(); }
                    }
                }
            };
            this._add(actor);
        });
    }

    // The part of the SVG you can actually see, in its own units. The
    // scene can paint past its viewBox (overflow visible) and the page may
    // be wider than the viewBox, so "off-screen" means past the WINDOW edge,
    // not the viewBox edge. Falls back to the viewBox.
    _visibleBox() {
        const vb = this.svg.viewBox.baseVal;
        const fallback = { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
        const m = this.svg.getScreenCTM && this.svg.getScreenCTM();
        if (!m || !vb.width) return fallback;
        const inv = m.inverse();
        const pt = this.svg.createSVGPoint();
        pt.x = 0; pt.y = 0;
        const a = pt.matrixTransform(inv);
        pt.x = window.innerWidth; pt.y = window.innerHeight;
        const b = pt.matrixTransform(inv);
        const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
        return box.width > 0 ? box : fallback;
    }

    // An off-screen point on one side, at a random height in the upper
    // part of the frame, plus a duration that keeps flight speed even on
    // wide screens (a longer trip takes longer).
    _offscreen(side, near, duration) {
        const vb = this.svg.viewBox.baseVal;
        const box = this._visibleBox();
        const pad = 30;
        const x = side === 'right' ? box.x + box.width + pad : box.x - pad;
        const y = vb.y + 40 + Math.random() * vb.height * 0.5;
        const ref = Math.max(1, vb.width / 2 + 40);
        const stretch = Math.min(3, Math.max(1, Math.abs(x - near.x) / ref));
        return { point: { x, y }, duration: duration * stretch };
    }

    // Leaves through the entrance and flies off-screen.
    leaveHive({ from, side = Math.random() < 0.5 ? 'right' : 'left', duration = 3.6 + Math.random() * 1.6, bee = {} } = {}) {
        const start = { x: from.x, y: from.y + 2 };
        const off = this._offscreen(side, start, duration);
        const to = off.point;
        return this.flyPath({
            from: start, to,
            c1: { x: start.x + (side === 'right' ? 40 : -40), y: start.y + 28 },
            c2: { x: to.x * 0.55 + start.x * 0.45, y: to.y + 50 },
            duration: off.duration, bee, shrinkAt: 'start'
        });
    }

    // Flies in from off-screen (with pollen by default) and goes inside.
    returnHive({ to, side = Math.random() < 0.5 ? 'right' : 'left', duration = 3.6 + Math.random() * 1.6, bee = {} } = {}) {
        const end = { x: to.x, y: to.y + 2 };
        const off = this._offscreen(side, end, duration);
        const from = off.point;
        return this.flyPath({
            from, to: end,
            c1: { x: from.x * 0.55 + end.x * 0.45, y: from.y + 50 },
            c2: { x: end.x + (side === 'right' ? 40 : -40), y: end.y + 28 },
            duration: off.duration, bee: { pollen: true, ...bee }, shrinkAt: 'end'
        });
    }

    // Flies in and lands on a spot, then starts walking there.
    async land({ at, side = Math.random() < 0.5 ? 'right' : 'left', duration = 3, bee = {}, range = 14 } = {}) {
        const off = this._offscreen(side, at, duration);
        const from = { x: off.point.x, y: at.y - 120 };
        duration = off.duration;
        const el = await this.flyPath({
            from, to: at,
            c1: { x: from.x * 0.5 + at.x * 0.5, y: from.y - 20 },
            c2: { x: at.x + (side === 'right' ? 30 : -30), y: at.y - 40 },
            duration, bee, keep: true
        });
        el.wrap.remove();
        return this.walk({ x: at.x, y: at.y, range, bee });
    }

    // Random leave / return trips every few seconds through one entrance.
    autoForage({ entrance, every = [1.8, 4.4], bee = {} } = {}) {
        this.forage = { entrance, every, bee, next: this.time + every[0] };
    }

    stopForage() {
        this.forage = null;
    }

    // ---- LOOP ------------------------------------------------------------

    start() {
        if (this.raf || this.reduceMotion) return;
        this.last = performance.now();
        const frame = (now) => {
            const dt = Math.min(0.05, (now - this.last) / 1000) * this.timeScale;
            this.last = now;
            this.time += dt;
            if (this.forage && this.time >= this.forage.next) {
                const f = this.forage;
                if (Math.random() < 0.5) this.leaveHive({ from: f.entrance, bee: f.bee });
                else this.returnHive({ to: f.entrance, bee: f.bee });
                f.next = this.time + f.every[0] + Math.random() * (f.every[1] - f.every[0]);
            }
            this.actors.forEach(a => a.update(dt, this.time));
            this.raf = requestAnimationFrame(frame);
        };
        this.raf = requestAnimationFrame(frame);
    }

    stop() {
        cancelAnimationFrame(this.raf);
        this.raf = null;
    }

    destroy() {
        this.stop();
        this.forage = null;
        [...this.actors].forEach(a => this._remove(a));
    }
}
