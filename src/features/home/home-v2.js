console.log("/// HOME v2 NAV PROTOCOLS INITIALIZED ///");

// Everything about rendering the page (status, level bar, Active Quest,
// Daily Tasks, App Grid) is home.js, loaded unmodified right before this
// file - this script ONLY wires up the new bottom nav's dropdowns and the
// FAB add-menu, since that's the one real difference from the original
// page. It does not touch Vault, does not duplicate any render function,
// and runs as a second, independent DOMContentLoaded listener alongside
// home.js's own.

function closeAllHvMenus() {
    document.querySelectorAll('.hv-nav-dropdown').forEach(d => { d.hidden = true; });
    document.querySelectorAll('.hv-nav-tab').forEach(t => t.classList.remove('is-active'));
    const fabMenu = document.getElementById('hv-fab-menu');
    if (fabMenu) fabMenu.hidden = true;
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.hv-nav-tab').forEach(tab => {
        tab.addEventListener('click', (event) => {
            event.stopPropagation();
            const category = tab.dataset.category;
            const dropdown = document.querySelector(`.hv-nav-dropdown[data-dropdown="${category}"]`);
            const willOpen = dropdown.hidden;
            closeAllHvMenus();
            if (willOpen) {
                dropdown.hidden = false;
                tab.classList.add('is-active');
            }
        });
    });

    const fabBtn = document.getElementById('hv-fab-btn');
    if (fabBtn) {
        fabBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const menu = document.getElementById('hv-fab-menu');
            const willOpen = menu.hidden;
            closeAllHvMenus();
            menu.hidden = !willOpen;
        });
    }

    document.addEventListener('click', closeAllHvMenus);
});
