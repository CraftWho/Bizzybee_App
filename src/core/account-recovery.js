const AccountRecovery = {
    async send(email) {
        const response = await fetch('/.netlify/identity/recover', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }), signal: AbortSignal.timeout(20000)
        });
        if (!response.ok) throw new Error(response.status === 429 ? 'Too many requests. Please wait before trying again.' : 'Could not request a reset email. Check your connection and try again.');
    },
    async reset(token, password) {
        const verified = await fetch('/.netlify/identity/verify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'recovery', token }), signal: AbortSignal.timeout(20000)
        });
        if (!verified.ok) throw new Error('This reset link is invalid or expired. Request a new email.');
        const session = await verified.json();
        const updated = await fetch('/.netlify/identity/user', {
            method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ password }), signal: AbortSignal.timeout(20000)
        });
        if (!updated.ok) throw new Error('Could not change the password. Request a new reset link and try again.');
    }
};
