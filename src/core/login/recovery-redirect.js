(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get('recovery_token');
    if (!token) return;
    // Remove the token before the Identity widget can see or consume it.
    history.replaceState(null, '', location.pathname + location.search);
    location.replace('./src/core/login/reset-password.html#recovery_token=' + encodeURIComponent(token));
})();
