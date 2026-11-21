// Add a private word (a name, username, email, place...) to the privacy guard.
// Only its fingerprint (sha256 of the lowercase word) is saved, so the word
// itself never goes into the repo.   Usage: node tools/privacy-add.mjs "word"
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('../tests/privacy-terms.json', import.meta.url);
const word = String(process.argv[2] || '').trim().toLowerCase();
if (!word) { console.log('Usage: node tools/privacy-add.mjs "word"'); process.exit(1); }
const list = JSON.parse(readFileSync(file, 'utf8'));
const h = createHash('sha256').update(word).digest('hex');
if (list.hashes.includes(h)) console.log('Already guarded.');
else { list.hashes.push(h); writeFileSync(file, JSON.stringify(list, null, 2) + '\n'); console.log('Guarded. The word itself was not saved.'); }
