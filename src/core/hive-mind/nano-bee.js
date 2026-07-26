console.log("/// NANO BEE MODULE ONLINE ///");

// Injects the glowing hex-core + flying bee scene into a container.
// size: 'mini' (Hive Mind FAB icon) or 'hero' (Login page centerpiece).
const NanoBee = {
    markup() {
        return `
            <div class="scene-inner">
                <svg class="hive-core" viewBox="0 0 100 100">
                    <defs>
                        <linearGradient id="metallic-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#FFF8B0" />
                            <stop offset="25%" stop-color="#D4AF37" />
                            <stop offset="50%" stop-color="#996515" />
                            <stop offset="100%" stop-color="#8A5A19" />
                        </linearGradient>
                    </defs>
                    <polygon class="hex-outline" points="50 5, 90 27.5, 90 72.5, 50 95, 10 72.5, 10 27.5" />
                    <line class="inner-line" x1="50" y1="5" x2="50" y2="50" />
                    <line class="inner-line" x1="10" y1="72.5" x2="50" y2="50" />
                    <line class="inner-line" x1="90" y1="72.5" x2="50" y2="50" />
                </svg>
                <div class="nano-bee">
                    <div class="bee-wing back"></div>
                    <div class="bee-wing"></div>
                    <div class="bee-tail"></div>
                    <div class="bee-leg leg-pair-1"></div>
                    <div class="bee-leg leg-pair-2"></div>
                    <div class="bee-leg leg-pair-3"></div>
                    <div class="bee-body"><div class="bee-eye"></div></div>
                </div>
            </div>
        `;
    },

    render(container, size = 'hero') {
        if (!container) return;
        container.classList.add('nano-bee-scene', `nano-bee-scene--${size}`);
        container.innerHTML = this.markup();
    }
};
