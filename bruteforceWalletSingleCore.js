const bitcoin = require('bitcoinjs-lib');
const crypto = require('crypto');
const ECPair = require('ecpair').ECPairFactory(require('tiny-secp256k1'));

const TESTNET = bitcoin.networks.testnet;
const ITERATIONS = 1500;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

function createLCG(seed) {
  let f = seed >>> 0;
  const increment = 1.013904223e9 >>> 0;
  return () => {
    f = (Math.imul(1664525, f) + increment) >>> 0;
    return f / 4294967296;
  };
}

function normalizeSalt(salt) {
  if (salt === undefined || salt === null) return undefined;
  const trimmed = salt.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isValidPrivateKey(buf) {
  try {
    ECPair.fromPrivateKey(buf, { network: TESTNET });
    return true;
  } catch { return false; }
}

function derivePrivateKey(timestamp, salt) {
  const normalizedSalt = normalizeSalt(salt);
  const inputStr = normalizedSalt ? `${timestamp}:${normalizedSalt}` : `${timestamp}`;
  const inputBuf = Buffer.from(inputStr, 'utf8');

  const hashSeed = sha256(inputBuf);
  const seed = hashSeed.readUInt32LE(0);

  const lcg = createLCG(seed);
  const privateKeyBuf = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    privateKeyBuf[i] = Math.floor(lcg() * 256);
  }

  let x = sha256(privateKeyBuf);
  for (let i = 0; i < ITERATIONS; i++) {
    x = sha256(x);
  }

  while (!isValidPrivateKey(x)) {
    x = sha256(x);
  }

  return x;
}

function bruteForceWalletSingleCore(timestamp, salt) {
  const privateKey = derivePrivateKey(timestamp, salt);
  const keyPair = ECPair.fromPrivateKey(privateKey, { network: TESTNET });
  const { address } = bitcoin.payments.p2pkh({
    pubkey: keyPair.publicKey,
    network: TESTNET,
  });
  if (!address) throw new Error('Could not generate address');
  return { address, privateKeyWIF: keyPair.toWIF(), timestamp };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: node bruteforceWalletSingleCore.js <target_address> [salt]');
  console.error('Example: node bruteforceWalletSingleCore.js mx4KBUHQMbSH3iAiFXT6UJ6eqdMWxZNQhA test');
  process.exit(1);
}

const targetAddr = args[0];
const salt       = args[1] ?? undefined;

// Point de départ : 2026-02-17 13:32:18 UTC
const TS_START = 1771436610333;

console.log(`\n🔍 Recherche de l'adresse : ${targetAddr}`);
console.log(`📅 Départ : ${TS_START} (2026-02-17 13:32:18 UTC)`);
console.log(`⬅️  Direction : passé (ts décroissant)`);
console.log(`🧂 Salt  : ${salt ?? '(aucun)'}\n`);

let checked = 0;
let found = false;
const startTime = Date.now();

for (let ts = TS_START; ts >= 0; ts--) {
  const wallet = bruteForceWalletSingleCore(ts, salt);
  checked++;

  // Progression toutes les 500 itérations
  if (checked % 500 === 0) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate    = (checked / ((Date.now() - startTime) / 1000)).toFixed(0);
    const tsDate  = new Date(ts).toISOString().replace('T', ' ').slice(0, 23);
    process.stdout.write(`\r⏳ ${checked.toLocaleString()} testés — ts actuel: ${ts} (${tsDate}) — ${rate} w/s — ${elapsed}s`);
  }

  if (wallet.address === targetAddr) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const tsDate  = new Date(ts).toISOString().replace('T', ' ').slice(0, 23);
    console.log(`\n\n✅ ADRESSE TROUVÉE !`);
    console.log(`Timestamp     : ${wallet.timestamp}`);
    console.log(`Date UTC      : ${tsDate}`);
    console.log(`Salt          : ${salt ?? '(aucun)'}`);
    console.log(`Address       : ${wallet.address}`);
    console.log(`Private Key   : ${wallet.privateKeyWIF}`);
    console.log(`Trouvé en     : ${elapsed}s après ${checked.toLocaleString()} essais`);
    found = true;
    break;
  }
}

if (!found) {
  console.log(`\n\n❌ Adresse non trouvée.`);
  console.log(`   ${checked.toLocaleString()} timestamps testés.`);
}
