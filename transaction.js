// transaction.js
const axios    = require('axios');
const bitcoin  = require('bitcoinjs-lib');
const tinysecp = require('tiny-secp256k1');
const { ECPairFactory } = require('ecpair');

const ECPair  = ECPairFactory(tinysecp);
const network = bitcoin.networks.testnet;

// --- PARAMÈTRES -------------------------------------------------------------
const FROM_WIF     = 'cSQ3LSeLtWd1SQXhkq8BTK4ZkSm7R7XDXZtNk4VAUcW3gTH1C77d';
const FROM_ADDRESS = 'mwxn6XXHCeP5baXQcyWLEX5AwL6azLRoeG';
const TO_ADDRESS   = 'n2JSAJdvFFWQT4UknbjwFbEXbDBUEbDFmQ';
const FIXED_FEE    = 500n; // en satoshis, BigInt
// ---------------------------------------------------------------------------

async function fetchUtxos(address) {
    const url = `https://blockstream.info/testnet/api/address/${address}/utxo`;
    const { data } = await axios.get(url);
    return data.filter(u => u.status && u.status.confirmed);
}

async function fetchTxHex(txid) {
    const url = `https://blockstream.info/testnet/api/tx/${txid}/hex`;
    const { data } = await axios.get(url);
    return data;
}

async function broadcastTx(hex) {
    const url = 'https://blockstream.info/testnet/api/tx';
    const { data } = await axios.post(url, hex, {
        headers: { 'Content-Type': 'text/plain' },
    });
    return data;
}

async function main() {
    const keyPair = ECPair.fromWIF(FROM_WIF, network);

    console.log(`Source (from): ${FROM_ADDRESS}`);
    console.log(`Destination  : ${TO_ADDRESS}\n`);

    const utxos = await fetchUtxos(FROM_ADDRESS);
    if (utxos.length === 0) {
        console.error('Aucun UTXO confirmé sur cette adresse.');
        process.exit(1);
    }

    let totalInput = 0n;
    for (const u of utxos) totalInput += BigInt(u.value);

    if (totalInput <= FIXED_FEE) {
        console.error(`Solde insuffisant: ${totalInput} sats (fee fixe ${FIXED_FEE} sats).`);
        process.exit(1);
    }

    const sendValue = totalInput - FIXED_FEE;

    console.log(`UTXO trouvés : ${utxos.length}`);
    console.log(`Total input  : ${totalInput} sats`);
    console.log(`Montant send : ${sendValue} sats`);
    console.log(`Fee          : ${FIXED_FEE} sats\n`);

    const psbt = new bitcoin.Psbt({ network });

    // Inputs
    for (const u of utxos) {
        const rawHex = await fetchTxHex(u.txid);
        psbt.addInput({
            hash: u.txid,
            index: u.vout,
            nonWitnessUtxo: Buffer.from(rawHex, 'hex'),
        });
    }

    // Output unique vers TO_ADDRESS
    psbt.addOutput({
        address: TO_ADDRESS,
        value: sendValue, // BigInt
    });

    // Signature de tous les inputs
    utxos.forEach((_, idx) => {
        psbt.signInput(idx, keyPair);
    });

    psbt.finalizeAllInputs();

    const txHex = psbt.extractTransaction().toHex();
    console.log(`Raw TX hex : ${txHex}\n`);

    const txid = await broadcastTx(txHex);
    console.log(`✅ Transaction diffusée sur testnet !`);
    console.log(`TXID : ${txid}`);
    console.log(`Explorer : https://blockstream.info/testnet/tx/${txid}`);
}

main().catch(err => {
    console.error('Erreur :', err.response ? err.response.data : err);
    process.exit(1);
});
