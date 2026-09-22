(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get('recovery_token');
    // Keep the token in memory only; no analytics, third-party widget, or storage.
    if (token) history.replaceState(null, '', location.pathname);
    const requestForm = document.getElementById('request-reset-form');
    const passwordForm = document.getElementById('new-password-form');
    const status = document.getElementById('recovery-status');
    requestForm.hidden = !!token;
    passwordForm.hidden = !token;
    requestForm.onsubmit = async event => {
        event.preventDefault();
        const button = requestForm.querySelector('button'); button.disabled = true;
        try {
            await AccountRecovery.send(document.getElementById('recovery-email').value.trim());
            status.textContent = 'If that account exists, a reset link will arrive by email. Check your spam folder too.';
        } catch (error) { status.textContent = error.message; }
        finally { button.disabled = false; }
    };
    passwordForm.onsubmit = async event => {
        event.preventDefault();
        const password = document.getElementById('new-password').value;
        if (password.length < 12 || password !== document.getElementById('confirm-password').value) {
            status.textContent = 'Use at least 12 characters and enter the same password twice.'; return;
        }
        const button = passwordForm.querySelector('button'); button.disabled = true;
        try {
            await AccountRecovery.reset(token, password);
            localStorage.removeItem('bizzybee_session');
            passwordForm.reset(); passwordForm.hidden = true;
            status.textContent = 'Password changed. Return to Login to sign in.';
        } catch (error) {
            status.textContent = error.message;
            passwordForm.hidden = true; requestForm.hidden = false;
        } finally { button.disabled = false; }
    };
})();
