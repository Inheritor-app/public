/**
 * SPDX-License-Identifier: CC0-1.0
 *
 * Downloads an inheritance payload from Arweave and accepts it only if it matches the record's on-chain
 * payloadFingerprint. A gateway is therefore not trusted: a wrong or tampered payload from one gateway is refused
 * and the next gateway is tried.
 *
 * This work has been dedicated to the public domain under the CC0 1.0 Universal Public Domain Dedication.
 */

const { payloadFingerprint } = require('./shared-definitions');
const { ClaimDenial } = require('./claim-context');

const DEFAULT_ARWEAVE_GATEWAYS = ['https://arweave.net', 'https://ar-io.net'];
const MAX_PAYLOAD_BYTES = 512 * 1024 * 1024;

/** Arweave's base64url transaction ID for the record's bytes32 arweaveTransactionId. */
function arweaveTransactionPath(arweaveTransactionId) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(arweaveTransactionId)) throw new Error('Invalid Arweave transaction ID');
    return Buffer.from(arweaveTransactionId.slice(2), 'hex').toString('base64url');
}

/**
 * @param {{arweaveTransactionId: string, expectedFingerprint: string, gateways?: string[], fetch?: Function, log?: Function}} options
 * @returns {Promise<{json: string, gateway: string}>} The payload text whose fingerprint matched
 */
async function downloadVerifiedPayload({ arweaveTransactionId, expectedFingerprint, gateways = DEFAULT_ARWEAVE_GATEWAYS, fetch = globalThis.fetch, log = () => {} }) {
    const txPath = arweaveTransactionPath(arweaveTransactionId);
    let mismatches = 0;
    for (const gateway of gateways) {
        const url = `${gateway.replace(/\/+$/, '')}/${txPath}`;
        const host = new URL(url).host;
        let text;
        try {
            const response = await fetch(url, { redirect: 'follow' });
            if (response.status !== 200) {
                log(`Arweave gateway ${host}: HTTP ${response.status}`);
                continue;
            }
            text = await response.text();
        } catch (error) {
            log(`Arweave gateway ${host}: no response`);
            continue;
        }
        if (text.length > MAX_PAYLOAD_BYTES) {
            log(`Arweave gateway ${host}: payload too large`);
            continue;
        }
        let fingerprint = null;
        try {
            fingerprint = payloadFingerprint(text);
        } catch {
            // Not an envelope: counted as a mismatch
        }
        if (fingerprint && fingerprint.toLowerCase() === expectedFingerprint.toLowerCase()) {
            return { json: text, gateway: host };
        }
        mismatches++;
        log(`Arweave gateway ${host}: payload does not match the on-chain fingerprint`);
    }
    if (mismatches > 0) throw new ClaimDenial('fingerprint_mismatch');
    throw new Error('No Arweave gateway returned the payload. Check your connection, or set INHERITOR_ARWEAVE_GATEWAYS.');
}

module.exports = { DEFAULT_ARWEAVE_GATEWAYS, arweaveTransactionPath, downloadVerifiedPayload };
