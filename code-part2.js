#!/usr/bin/env node
const A = 1664525 >>> 0;
const C = 1013904223 >>> 0;

function nextState(state) {
  // (A*state + C) mod 2^32
  return (Math.imul(A, state) + C) >>> 0;
}

function secretFromRequestId(requestIdHex) {
  if (!/^[0-9a-fA-F]{8}$/.test(requestIdHex)) {
    throw new Error("requestId must be 8 hex chars (e.g. 9611afc8)");
  }

  let state = parseInt(requestIdHex, 16) >>> 0;
  const out = [];

  for (let i = 0; i < 16; i++) {
    state = nextState(state);
    out.push(state & 0xff);
  }

  return Buffer.from(out).toString("hex");
}

// CLI
const requestId = process.argv[2] || "9611afc8";
const token = secretFromRequestId(requestId);
console.log(`requestId   = ${requestId.toLowerCase()}`);
console.log(`secretToken = ${token}`);

