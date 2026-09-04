console.log("/// CLOCK PICKER MODULE ONLINE ///");

// Reusable 12-hour analog time-wheel picker - hour mode (1-12) advances
// straight to minute mode (:00/:05/.../:55) on pick, same two-step flow as
// a native mobile time picker. Extracted out of create-daily.js and
// create-todo.js, which each carried a byte-for-byte identical copy of
// this widget (only the DOM ids differed) - see the project-tuning pass
// before Hive Defense. Renders its own markup into a given container (same
// "component owns its DOM" convention as BeeCard/ItemCard) instead of
// expecting page-specific ids to already exist in the page's own HTML, so
// a page just needs one empty mount point.
//
// Multiple pickers per page were never a real case before this extraction
// and still aren't, but state is keyed off the container (a WeakMap, not a
// single module-level variable) so that isn't a limitation of the shared
// version - two independent pickers on one page would just work.
const ClockPicker = {
    _instances: new WeakMap(),

    // Face geometry - a 200x200 face, 12 spots evenly spaced around a
    // shared radius for both hour mode (1-12) and minute mode (:00...:55).
    CENTER: 100,
    RADIUS: 80,

    markup() {
        return `
            <div class="clock-wheel-widget">
                <div class="clock-wheel" data-mode="hour">
                    <div class="clock-wheel-hand"></div>
                    <div class="clock-wheel-center-dot"></div>
                    <div class="clock-wheel-face"></div>
                </div>
                <div class="clock-wheel-controls">
                    <span class="clock-wheel-readout">12:00 AM</span>
                    <div class="clock-wheel-period-toggle">
                        <button type="button" class="clock-wheel-period-btn clock-wheel-period-btn--selected" data-period="AM">AM</button>
                        <button type="button" class="clock-wheel-period-btn" data-period="PM">PM</button>
                    </div>
                </div>
            </div>
        `;
    },

    // Builds the widget inside `container` and wires it up, starting from
    // 12:00 AM. Every other method below takes that same `container` to
    // say which picker instance it means.
    render(container) {
        if (!container) return;
        container.innerHTML = this.markup();
        this._instances.set(container, { mode: 'hour', hour: 12, minute: 0, period: 'AM' });

        container.querySelectorAll('.clock-wheel-period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const state = this._instances.get(container);
                state.period = btn.dataset.period;
                container.querySelectorAll('.clock-wheel-period-btn').forEach(b => {
                    b.classList.toggle('clock-wheel-period-btn--selected', b === btn);
                });
                this._updateReadout(container);
            });
        });

        this._renderFace(container);
        this._updateReadout(container);
    },

    // Maps a position (0-11) around the 12-spot ring to an x/y on the face,
    // 12 o'clock at the top, going clockwise - same layout as a real analog
    // clock face.
    _polarXY(index) {
        const angle = (index / 12) * 2 * Math.PI - Math.PI / 2;
        return {
            x: this.CENTER + this.RADIUS * Math.cos(angle),
            y: this.CENTER + this.RADIUS * Math.sin(angle)
        };
    },

    _renderFace(container) {
        const state = this._instances.get(container);
        const wheel = container.querySelector('.clock-wheel');
        const face = container.querySelector('.clock-wheel-face');
        const hand = container.querySelector('.clock-wheel-hand');
        wheel.dataset.mode = state.mode;

        const values = state.mode === 'hour'
            ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
            : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
        const selectedValue = state.mode === 'hour' ? state.hour : state.minute;

        face.innerHTML = values.map((value, index) => {
            const { x, y } = this._polarXY(index);
            const label = state.mode === 'minute' ? String(value).padStart(2, '0') : value;
            const selected = value === selectedValue;
            return `<button type="button" class="clock-wheel-num${selected ? ' clock-wheel-num--selected' : ''}" style="left:${x}px; top:${y}px;" data-value="${value}">${label}</button>`;
        }).join('');

        const selectedIndex = values.indexOf(selectedValue);
        const handAngle = (selectedIndex / 12) * 360;
        hand.style.height = `${this.RADIUS - 12}px`;
        hand.style.transform = `translateX(-50%) rotate(${handAngle}deg)`;

        face.querySelectorAll('.clock-wheel-num').forEach(btn => {
            btn.addEventListener('click', () => {
                const value = Number(btn.dataset.value);
                if (state.mode === 'hour') {
                    state.hour = value;
                    state.mode = 'minute';
                } else {
                    state.minute = value;
                }
                this._renderFace(container);
                this._updateReadout(container);
            });
        });
    },

    _updateReadout(container) {
        const state = this._instances.get(container);
        container.querySelector('.clock-wheel-readout').textContent =
            `${state.hour}:${String(state.minute).padStart(2, '0')} ${state.period}`;
    },

    // 12-hour + AM/PM -> the 24-hour "HH:MM" string reminders are stored/
    // compared as everywhere else in the app.
    getTime24(container) {
        const state = this._instances.get(container);
        let h = state.hour % 12;
        if (state.period === 'PM') h += 12;
        return `${String(h).padStart(2, '0')}:${String(state.minute).padStart(2, '0')}`;
    },

    // Back to 12:00 AM, hour mode - called after a reminder is added, same
    // as the two original copies did, so the picker is ready for the next
    // one instead of sitting on whatever was last picked.
    reset(container) {
        const state = this._instances.get(container);
        state.mode = 'hour';
        state.hour = 12;
        state.minute = 0;
        state.period = 'AM';
        container.querySelectorAll('.clock-wheel-period-btn').forEach(btn => {
            btn.classList.toggle('clock-wheel-period-btn--selected', btn.dataset.period === 'AM');
        });
        this._renderFace(container);
        this._updateReadout(container);
    },

    // "HH:MM" 24h -> "H:MM AM/PM" display string, for showing an already-
    // saved reminder time in a list (not the live picker itself). Static/
    // stateless - doesn't need a container.
    formatTime12h(hm) {
        const [h, m] = hm.split(':').map(Number);
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12}:${String(m).padStart(2, '0')} ${period}`;
    }
};
