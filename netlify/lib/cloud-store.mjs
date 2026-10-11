import { getStore } from '@netlify/blobs';
import { randomUUID } from 'node:crypto';
import { encryptSave, decryptSave } from './save-crypto.mjs';
export const HOURS = [4, 8, 12, 24];
export const RETAIN = 30;
export const saves = () => getStore({ name: 'bizzybee-saves', consistency: 'strong' });
export const backups = () => getStore({ name: 'bizzybee-backups', consistency: 'strong' });
export const schedules = () => getStore({ name: 'bizzybee-backup-schedules', consistency: 'strong' });
export function json(value, status = 200) {
    return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
export function validateSave(data) {
    if (typeof data !== 'string') throw new Error('Missing save data.');
    if (Buffer.byteLength(data, 'utf8') > 4 * 1024 * 1024) throw new Error('Save exceeds the 4 MB cloud limit.');
    const parsed = JSON.parse(data);
    if (!parsed || !parsed.user || typeof parsed.user !== 'object' || Array.isArray(parsed.user) || !Array.isArray(parsed.quests)) throw new Error('Invalid Bizzybee save.');
    if (parsed.schemaVersion != null && (!Number.isInteger(parsed.schemaVersion) || parsed.schemaVersion < 1 || parsed.schemaVersion > 8)) throw new Error('Unsupported schema.');
    for (const field of ['dailyTasks', 'habits', 'todos', 'dictionary', 'studyQueue', 'calendarEvents']) {
        if (parsed[field] != null && !Array.isArray(parsed[field])) throw new Error('Invalid save collection.');
    }
    for (const quest of parsed.quests) {
        if (!quest || typeof quest.id !== 'string' || !Array.isArray(quest.tasks)) throw new Error('Invalid quest.');
        // Points are "xp" from schema 8; older saves (and older app versions
        // still open somewhere) send "dp" - accept either.
        for (const task of quest.tasks) {
            const points = task ? (task.xp ?? task.dp) : undefined;
            if (typeof points !== 'number' || !Number.isFinite(points)) throw new Error('Invalid task points.');
        }
    }
    return data;
}
export function plain(entry, userId) {
    return entry.encrypted ? decryptSave(entry.encrypted, userId) : validateSave(entry.data);
}
export async function readLatest(userId) { return saves().getWithMetadata(userId, { type: 'json' }); }
export async function ensureSchedule(userId) {
    const result = await schedules().setJSON(userId, { hours: 24, startsAt: Date.now() }, { onlyIfNew: true });
    if (result.modified && !result.etag) throw new Error('Could not initialize backup schedule.');
}
export async function listBackups(userId) {
    const { blobs } = await backups().list({ prefix: `${userId}/` });
    return blobs.map(({ key }) => ({ id: key.slice(userId.length + 1), createdAt: new Date(Number(key.slice(userId.length + 1).split('-')[0])).toISOString() })).sort((a, b) => b.id.localeCompare(a.id));
}
export async function createBackup(userId, entry, reason = 'manual', id = `${Date.now()}-${randomUUID()}`) {
    const record = { encrypted: encryptSave(plain(entry, userId), userId), updatedAt: entry.updatedAt, reason, createdAt: new Date().toISOString() };
    const result = await backups().setJSON(`${userId}/${id}`, record, { onlyIfNew: true });
    if (result.modified && !result.etag) throw new Error('Backup was not acknowledged by storage.');
    if (result.modified) {
        const old = (await listBackups(userId)).slice(RETAIN);
        await Promise.all(old.map(item => backups().delete(`${userId}/${item.id}`)));
    }
    return id;
}
