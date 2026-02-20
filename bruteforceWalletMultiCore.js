const { Worker, isMainThread, workerData, parentPort } = require('worker_threads');
const bitcoin = require('bitcoinjs-lib');
const os = require('os');

if (isMainThread) {
    const targetAddr = process.argv[2];
    const salt = (process.argv[3] || "").trim().toLowerCase();

    if (!targetAddr) {
        console.error("Usage: node multicore.js <target_address> [salt]");
        process.exit(1);
    }

    let targetHash;
    try {
        targetHash = bitcoin.address.fromBase58Check(targetAddr).hash;
    } catch (e) {
        console.error("Erreur: Adresse Bitcoin invalide.");
        process.exit(1);
    }

    const numCPUs = os.cpus().length;
    const TS_START = 1771335138000;

    console.log(`🚀 Mode Ultra-Optimisé lancé sur ${numCPUs} cœurs CPU...`);
    console.log(`🎯 Cible : ${targetAddr} (Hash160: ${Buffer.from(targetHash).toString('hex')})`);
    console.log(`🧂 Salt  : ${salt || "(aucun)"}\n`);

    const startTime = Date.now();
    const workerStats = new Array(numCPUs).fill(0);

    for (let i = 0; i < numCPUs; i++) {
        const startTs = TS_START - i;
        const worker = new Worker(__filename, {
            workerData: { startTs, targetHash, salt, threadId: i, step: numCPUs }
        });

        worker.on('message', (msg) => {
            if (msg.type === 'PROGRESS') {
                workerStats[msg.threadId] = msg.checked;
                const totalChecked = workerStats.reduce((a, b) => a + b, 0);
                const elapsed = (Date.now() - startTime) / 1000;
                const rate = (totalChecked / elapsed).toFixed(0);
                const currentTsDate = new Date(msg.currentTs).toISOString().replace('T', ' ').slice(0, 19);

                process.stdout.write(
                    `\r⏳ ${totalChecked.toLocaleString()} testés | ` +
                    `${rate} w/s | ` +
                    `TS: ${msg.currentTs} (${currentTsDate})`
                );
            } else if (msg.type === 'FOUND') {
                const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                console.log(`\n\n✅ ADRESSE TROUVÉE par le thread ${msg.threadId} !`);
                console.log(`Timestamp   : ${msg.data.timestamp}`);
                console.log(`WIF Key     : ${msg.data.wif}`);
                console.log(`Temps total : ${totalElapsed}s`);
                process.exit(0);
            }
        });
    }
} else {
    const crypto = require('crypto');
    const bitcoin = require('bitcoinjs-lib');
    const ecc = require('tiny-secp256k1');
    const { startTs, targetHash, salt, threadId, step } = workerData;

    const targetHashBuf = Buffer.from(targetHash);
    const ITERATIONS = 1500;
    const TESTNET = bitcoin.networks.testnet;

    function fillPrivateKey(f, buf) {
        const increment = 1013904223 >>> 0;
        for (let i = 0; i < 32; i++) {
            f = (Math.imul(1664525, f) + increment) >>> 0;
            buf[i] = f >>> 24;
        }
        return f;
    }

    const pkBuf = Buffer.alloc(32);
    let checked = 0;

    for (let ts = startTs; ts >= 0; ts -= step) {
        const input = salt ? `${ts}:${salt}` : `${ts}`;
        let x = crypto.createHash('sha256').update(input).digest();

        fillPrivateKey(x.readUInt32LE(0), pkBuf);

        x = pkBuf;
        for (let i = 0; i <= ITERATIONS; i++) {
            x = crypto.createHash('sha256').update(x).digest();
        }

        while (!ecc.isPrivate(x)) {
            x = crypto.createHash('sha256').update(x).digest();
        }

        const pubKey = ecc.pointFromScalar(x, true);
        const currentHash = bitcoin.crypto.hash160(pubKey);

        if (Buffer.from(currentHash).equals(targetHashBuf)) {
            const ECPair = require('ecpair').ECPairFactory(ecc);
            const keyPair = ECPair.fromPrivateKey(x, { network: TESTNET });
            parentPort.postMessage({
                type: 'FOUND',
                threadId,
                data: { timestamp: ts, wif: keyPair.toWIF() }
            });
            break;
        }

        checked++;
        if (checked % 1000 === 0) {
            parentPort.postMessage({ type: 'PROGRESS', threadId, checked, currentTs: ts });
        }
    }
}