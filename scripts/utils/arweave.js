/**
 * SPDX-License-Identifier: CC0-1.0
 *
 * Downloads an inheritance payload from Arweave and accepts it only if it matches the record's on-chain
 * payloadFingerprint. A gateway is therefore not trusted: a wrong or tampered payload from one gateway is refused
 * and the next gateway is tried. Each download is read as a stream with a size limit, an idle timeout and a total
 * deadline, so a gateway can neither exhaust memory nor stall the claim.
 *
 * This work has been dedicated to the public domain under the CC0 1.0 Universal Public Domain Dedication.
 */

const { payloadFingerprint } = require('./shared-definitions');
const { ClaimDenial } = require('./claim-context');
const { readBodyBounded, discardBody, BodyTooLarge } = require('./bounded-body');

const DEFAULT_ARWEAVE_GATEWAYS = ['https://arweave.net', 'https://ar-io.net'];
const LIMITS = {
    maxBytes: 512 * 1024 * 1024,
    // No data for this long aborts the download
    idleTimeoutMs: 60 * 1000,
    totalTimeoutMs: 30 * 60 * 1000
};

class DownloadAborted extends Error {}

/** Reads a response body as UTF-8 text within the limits, or throws DownloadAborted. */
async function readBounded(url, fetch, { maxBytes, idleTimeoutMs, totalTimeoutMs }) {
    const controller = new AbortController();
    const abort = (reason) => controller.abort(new DownloadAborted(reason));
    const total = setTimeout(() => abort('too slow'), totalTimeoutMs);
    let idle = setTimeout(() => abort('stalled'), idleTimeoutMs);
    const touch = () => {
        clearTimeout(idle);
        idle = setTimeout(() => abort('stalled'), idleTimeoutMs);
    };
    try {
        const response = await fetch(url, { redirect: 'follow', signal: controller.signal });
        if (response.status !== 200) {
            await discardBody(response);
            throw new DownloadAborted(`HTTP ${response.status}`);
        }
        return (await readBodyBounded(response, maxBytes, touch)).toString('utf8');
    } catch (error) {
        if (error instanceof DownloadAborted) throw error;
        if (error instanceof BodyTooLarge) throw new DownloadAborted('payload too large');
        if (controller.signal.aborted && controller.signal.reason instanceof DownloadAborted) throw controller.signal.reason;
        throw new DownloadAborted('no response');
    } finally {
        clearTimeout(total);
        clearTimeout(idle);
    }
}

/** Arweave's base64url transaction ID for the record's bytes32 arweaveTransactionId. */
function arweaveTransactionPath(arweaveTransactionId) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(arweaveTransactionId)) throw new Error('Invalid Arweave transaction ID');
    return Buffer.from(arweaveTransactionId.slice(2), 'hex').toString('base64url');
}

/**
 * Every payload, gateway by gateway, that matches the on-chain fingerprint. The fingerprint does not cover the
 * recipient blocks, so a matching payload can still fail to decrypt; the caller then asks for the next one.
 * Throws when no gateway served a matching payload at all.
 * @param {{arweaveTransactionId: string, expectedFingerprint: string, gateways?: string[], fetch?: Function, log?: Function,
 *     maxBytes?: number, idleTimeoutMs?: number, totalTimeoutMs?: number}} options
 * @returns {AsyncGenerator<{json: string, gateway: string}>}
 */
async function* verifiedPayloads({ arweaveTransactionId, expectedFingerprint, gateways = DEFAULT_ARWEAVE_GATEWAYS, fetch = globalThis.fetch, log = () => {}, ...limits }) {
    const bounds = { ...LIMITS, ...limits };
    const txPath = arweaveTransactionPath(arweaveTransactionId);
    let mismatches = 0;
    let matches = 0;
    for (const gateway of gateways) {
        const url = `${gateway.replace(/\/+$/, '')}/${txPath}`;
        const host = new URL(url).host;
        let text;
        try {
            text = await readBounded(url, fetch, bounds);
        } catch (error) {
            log(`Arweave gateway ${host}: ${error.message}`);
            continue;
        }
        let fingerprint = null;
        try {
            fingerprint = payloadFingerprint(text);
        } catch {
            // Not an envelope: counted as a mismatch
        }
        if (fingerprint && fingerprint.toLowerCase() === expectedFingerprint.toLowerCase()) {
            matches++;
            yield { json: text, gateway: host };
            continue;
        }
        mismatches++;
        log(`Arweave gateway ${host}: payload does not match the on-chain fingerprint`);
    }
    if (matches > 0) return;
    if (mismatches > 0) throw new ClaimDenial('fingerprint_mismatch');
    throw new Error('No Arweave gateway returned the payload. Check your connection, or set INHERITOR_ARWEAVE_GATEWAYS.');
}

/** The first payload that matches the on-chain fingerprint. */
async function downloadVerifiedPayload(options) {
    for await (const payload of verifiedPayloads(options)) return payload;
}

module.exports = { DEFAULT_ARWEAVE_GATEWAYS, arweaveTransactionPath, verifiedPayloads, downloadVerifiedPayload };
