import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
function key() {
    const value = process.env.BIZZYBEE_SAVE_KEY;
    if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) throw new Error('Set BIZZYBEE_SAVE_KEY in Netlify to enable encrypted cloud storage.');
    return Buffer.from(value, 'hex');
}
export function encryptSave(data, userId) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key(), iv);
    cipher.setAAD(Buffer.from(`bizzybee:v1:${userId}`));
    const ciphertext = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    return { version: 1, algorithm: 'AES-256-GCM', iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
export function decryptSave(envelope, userId) {
    if (envelope?.version !== 1 || envelope.algorithm !== 'AES-256-GCM') throw new Error('Unsupported save encryption.');
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(`bizzybee:v1:${userId}`));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
