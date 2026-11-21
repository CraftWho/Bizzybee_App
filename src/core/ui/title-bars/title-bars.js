// Title bars (Nov 21 2026, Craft: approved "B", heading inside its box).
// Rule: no text sits right on the honeycomb.
//   - A section heading with its panel right after it becomes that panel's
//     title bar (one box: title strip on top, panel below).
//   - A heading with no panel after it, and a page title, get a solid plate.
//   - Loose notes on the honeycomb get a solid note box.
//   - THE BACKPLATE GUARD (Nov 21 2026, Craft: "a sure fire way"): any box on
//     the honeycomb with a see-through background becomes the app's standard
//     box: black, gold outline, red top border ([data-bb-plated] in global.css).
//     Works for anything, including boxes that only appear later (unlocks,
//     pop-ups). Rule: docs/THEME-RULES.md.
// It only adds classes and colors (and a margin fix), never moves anything, and
// runs again when a page draws more content or a box changes state. Styles: title-bars.css.
const TitleBars = (() => {
    const HEAD = 'main h1, main h2, main h3, body > h1, body > h2, .sec, [class*="-sec"]:not(section), .settings-title, .page-title';
    const LOOSE = 'p, small, li, label, a, span, div, b';
    const SKIP = '.ah, .app-head, .app-dock, .dk, header, nav, [class$="-scrim"], [class*="-sheet"], .hn-tip, .hn-eve-pop, .hn-ask, .ii-scrim, .toast, [class*="toast"], dialog, .bb-tb, .bb-loose, svg, canvas, [data-no-tidy]';
    const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return c === 'transparent' ? 0 : 0; const v = m[1].split(',').map(parseFloat); return v.length > 3 ? v[3] : 1; };
    const solid = (cs) => alpha(cs.backgroundColor) >= 0.85 || (cs.backgroundImage && cs.backgroundImage !== 'none');
    // Is this element sitting right on the page background (nothing solid behind it)?
    function onHoneycomb(el) {
        for (let e = el.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (solid(cs)) return false;
            if (cs.position === 'fixed' || cs.position === 'sticky') return false;
        }
        return true;
    }
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden'; };
    const ownText = (el) => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    const isPanel = (el) => { if (!el || !visible(el)) return false; const cs = getComputedStyle(el); return solid(cs) && parseFloat(cs.borderTopLeftRadius) >= 4 && el.getBoundingClientRect().height > 24; };

    const seeThrough = (cs) => { const a = alpha(cs.backgroundColor); const img = cs.backgroundImage && cs.backgroundImage !== 'none' && !/url\(/.test(cs.backgroundImage);
        return (a > 0.02 && a < 0.85) || (img && /rgba\([^)]*,\s*0?\.\d+\)|transparent/.test(cs.backgroundImage) && a < 0.85); };
    function plate() {
        // re-check plated boxes (their state may have changed, e.g. "on")
        document.querySelectorAll('[data-bb-plated]').forEach(el => el.removeAttribute('data-bb-plated'));
        document.querySelectorAll('body *').forEach(el => {
            if (el.closest('.ah, .app-head, .app-dock, .dk, header, nav, .hn-tip, .hn-eve-pop, .toast, [class*="toast"], svg, canvas, [data-no-tidy]')) return;
            const cs = getComputedStyle(el);
            if (!seeThrough(cs) || cs.position === 'fixed' || !visible(el)) return;
            if (parseFloat(cs.opacity) < 0.95 || el.getBoundingClientRect().height < 16) return;
            if (!(el.innerText || '').trim()) return;          // only boxes that hold text
            if (!onHoneycomb(el)) return;                       // something solid is already behind it
            el.setAttribute('data-bb-plated', '');   // the standard box look (global.css)
        });
    }

    function run() {
        try { plate(); } catch (e) { /* never break a page */ }
        // 1. headings
        document.querySelectorAll(HEAD).forEach(h => {
            if (h.classList.contains('bb-tb') || h.closest(SKIP.replace(', .bb-tb', '')) || !visible(h) || !(h.innerText || '').trim()) return;
            const cs = getComputedStyle(h);
            if (solid(cs) || !onHoneycomb(h)) return;
            // the next thing you can see (hidden bits in between don't count)
            const nextShown = (el) => { let n = el.nextElementSibling; while (n && (getComputedStyle(n).display === 'none' || n.hidden)) n = n.nextElementSibling; return n; };
            let next = nextShown(h);
            // a short note between the heading and its panel becomes the middle of the box
            let mid = null;
            if (next && !isPanel(next) && /^(P|SMALL|DIV)$/.test(next.tagName) && ownText(next) && next.children.length <= 3) { mid = next; next = nextShown(next); }
            if (h.tagName !== 'H1' && isPanel(next)) {
                h.classList.add('bb-tb');
                next.classList.add('bb-tb-next');
                if (mid) { mid.classList.add('bb-tb-mid'); mid.classList.remove('bb-loose'); }
                // match the panel's width, and cancel a gap from the parent's grid/flex
                const ns = getComputedStyle(next), ps = getComputedStyle(h.parentElement);
                h.style.marginLeft = ns.marginLeft; h.style.marginRight = ns.marginRight;
                const gap = parseFloat(ps.rowGap) || 0;
                if (gap && /grid|flex/.test(ps.display)) { next.style.marginTop = `-${gap}px`; if (mid) mid.style.marginTop = `-${gap}px`; }
                if (mid) { mid.style.marginLeft = ns.marginLeft; mid.style.marginRight = ns.marginRight; }
            } else if (mid && h.tagName !== 'H1') {
                // heading + note make one box (a list of cards follows)
                h.classList.add('bb-tb');
                mid.classList.add('bb-tb-mid', 'bb-tb-end'); mid.classList.remove('bb-loose');
                const ms = getComputedStyle(mid); h.style.marginLeft = ms.marginLeft; h.style.marginRight = ms.marginRight;
            } else {
                h.classList.add('bb-tb', h.tagName === 'H1' ? 'bb-tb-page' : 'bb-tb-solo');
            }
        });
        // 2. loose text (block-level only; inline bits get a box of their own when nothing around them has one)
        document.querySelectorAll(LOOSE).forEach(el => {
            if (el.closest(SKIP) || !ownText(el) || !visible(el)) return;
            if (el.closest('.bb-loose, .bb-tb, .bb-tb-mid')) return;
            if (solid(getComputedStyle(el)) || !onHoneycomb(el)) return;
            el.classList.add('bb-loose');
        });
    }
    let t = null;
    const soon = () => { clearTimeout(t); t = setTimeout(run, 150); };
    function start() {
        run();
        new MutationObserver((list) => { if (list.some(m => m.type === 'childList' || (m.attributeName === 'class' && !/^bb-/.test(String(m.target.className))))) soon(); })
            .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
        window.addEventListener('load', soon);
        setTimeout(run, 1500);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    return { run };
})();
if (typeof globalThis !== 'undefined') globalThis.TitleBars = TitleBars;
