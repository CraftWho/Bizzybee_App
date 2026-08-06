console.log("/// STATUS DOT (shared) INITIALIZED ///");

// Shared color palette + markup builder for the .status-dot preset
// (status-dot.css). Centralizing the palette here means every feature that
// wants a colored status indicator (Quest task relevance, Ghost Log
// partial-credit, Daily difficulty, and anything future) pulls from the
// same colors instead of each page picking its own hex values - so
// "green" always means the same green everywhere in the app.
const StatusDot = {
    COLORS: {
        green: '#4caf50',
        yellow: '#e6c200',
        red: '#dc143c',
        gray: '#888888',
        gold: '#ffd700'
    },

    // color: a key from COLORS above, OR any raw CSS color string (so a
    // caller with its own exact hex value can still use the same dot/
    // animation without being forced through the shared palette).
    // options.title: optional tooltip text.
    // options.large: use the bigger .status-dot--lg variant.
    html(color, { title, large } = {}) {
        const resolved = StatusDot.COLORS[color] || color || StatusDot.COLORS.gray;
        const delay = `${(Math.random() * 1.6).toFixed(2)}s`;
        const sizeClass = large ? ' status-dot--lg' : '';
        return `<span class="status-dot${sizeClass}" style="--dot-color: ${resolved}; --dot-delay: ${delay};"${title ? ` title="${String(title).replace(/"/g, '&quot;')}"` : ''}></span>`;
    }
};
