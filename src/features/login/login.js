console.log("/// AUTH TERMINAL ONLINE ///");

document.addEventListener('DOMContentLoaded', () => {
    NanoBee.render(document.querySelector('.hive-core-bg'), 'hero');

    document.getElementById('login-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        // Auth is not implemented yet - this is a placeholder until the Vault
        // gains real credential handling.
        alert('🐝 Auth Core not yet online. Check back soon, Worker Bee.');
    });
});
