const crypto   = require('crypto');
const fs       = require('fs');
const readline = require('readline');

const TARGET_HASH = 'cfb2a93462484ca6fca3620f91cad568f72dcdc79e88b4d26e2e2ec10f291597';
const DICT_PATH   = '/usr/share/wordlists/rockyou.txt';

function normalizeSalt(input) {
    if (input === undefined || input === null) return undefined;
    const s = input.trim().toLowerCase();
    return s.length ? s : undefined;
}

function saltToHash(word) {
    const normalized = normalizeSalt(word);
    if (!normalized) return null;
    return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

console.log(`[*] Cible   : ${TARGET_HASH}`);
console.log(`[*] Dico    : ${DICT_PATH}`);
console.log(`[*] Démarrage...\n`);

const t0 = Date.now();
let count = 0;

const rl = readline.createInterface({
    input: fs.createReadStream(DICT_PATH, { encoding: 'latin1' }),
    crlfDelay: Infinity
});

rl.on('line', (word) => {
    count++;
    const hash = saltToHash(word);

    if (hash === TARGET_HASH) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
        console.log(`\n${'='.repeat(52)}`);
        console.log(`  ✅ MOT TROUVÉ !`);
        console.log(`${'='.repeat(52)}`);
        console.log(`  Mot original  : "${word}"`);
        console.log(`  Normalisé     : "${normalizeSalt(word)}"`);
        console.log(`  SHA256        : ${hash}`);
        console.log(`  Ligne         : ${count.toLocaleString()}`);
        console.log(`  Temps         : ${elapsed}s`);
        process.exit(0);
    }

    if (count % 200_000 === 0) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        process.stdout.write(`  ${count.toLocaleString()} mots | ${elapsed}s écoulées\r`);
    }
});

rl.on('close', () => {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`\n[!] Non trouvé après ${count.toLocaleString()} mots (${elapsed}s).`);
});
