// Hive Mind weather (Oct 28 2026, Craft). Puts the live sky (WeatherFX,
// src/core/ui/weather-fx/) around the hive, and a weather widget under the
// title. Uses Settings › Weather. With weather off, the sky still follows
// the time of day. Try any sky with ?sky=rain (clear, partly, cloudy, fog,
// drizzle, rain, heavy, snow, storm) and ?hour=21 for the time.
(function () {
    const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const params = new URLSearchParams(location.search);
    const forced = params.get('sky');
    const hour = params.get('hour');

    function widget(w) {
        const head = document.querySelector('#colony-exterior .cm-head');
        if (!head) return;
        let el = document.getElementById('cm-wx');
        if (!el) { el = document.createElement('a'); el.id = 'cm-wx'; el.className = 'cm-wx'; head.appendChild(el); }
        el.href = '../settings/settings.html#weather';
        const P = typeof BizzyPhone !== 'undefined' ? BizzyPhone : null;
        if (!w) {
            el.innerHTML = `<span class="cm-wx-ic">${P ? P.iconSVG(isNight() ? 'clear' : 'clear', !isNight()) : '🌤️'}</span>
                <span class="cm-wx-mid"><b>Live sky</b><small>Follows the time of day. Tap to add your weather.</small></span><span class="cm-wx-go">›</span>`;
            return;
        }
        el.innerHTML = `<span class="cm-wx-ic">${P ? P.iconSVG(w.kind, w.isDay !== false) : esc(w.icon)}</span>
            <span class="cm-wx-mid"><b>${w.temp}°${esc(w.unit)} · ${esc(w.text)}</b><small>${esc(w.place)} · H ${w.hi}° L ${w.lo}°${w.rain >= 20 ? ` · ${w.rain}% rain` : ''}</small></span><span class="cm-wx-go">›</span>`;
    }
    const isNight = () => { const h = new Date().getHours(); return h < 6 || h >= 19; };

    function start() {
        const scene = document.getElementById('colony-nest-scene');
        if (!scene || typeof WeatherFX === 'undefined') return;
        if (hour != null) { const real = Date.now; const d = new Date(); d.setHours(Number(hour), 0, 0, 0); const off = d.getTime() - real(); Date.now = () => real() + off; }
        const fx = WeatherFX.mount(scene, scene);
        scene.classList.add('wx-live');
        if (forced) fx.set({ kind: forced, wind: 14 });
        let tries = 0;
        const load = async () => {
            if (typeof BizzyPhone === 'undefined') { if (++tries < 60) setTimeout(load, 150); else widget(null); return; }
            const w = await BizzyPhone.Weather.now().catch(() => null);
            widget(w);
            if (w && !forced) fx.set({ kind: w.kind || 'clear', wind: w.wind || 8, sunrise: w.sunrise, sunset: w.sunset });
        };
        load();
        setInterval(load, 15 * 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
