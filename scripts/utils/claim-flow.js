/**
 * SPDX-License-Identifier: CC0-1.0
 *
 * The beneficiary's claim of a v3 inheritance with envelope v2:
 *
 * 1. Verified claim check: registry, contract version, pause flag and record at the finalized and the latest block,
 *    agreed by two independent providers (claim-context.js).
 * 2. Download the payload from Arweave and accept it only if it matches the on-chain payloadFingerprint and has a
 *    usable ML-KEM-768 recipient.
 * 3. Run the claim check again, so a check-in, revocation or pause during the download stops the claim before
 *    anything is signed, then request the wrapped key with a signed v2 release request.
 * 4. Run the claim check again before decryption and require the same record. Decryption must follow within
 *    MAX_CONTEXT_AGE_MS of the reads of the check before it.
 * 5. Decrypt the asset under the envelope v2 context of the verified record, with purpose "asset". The fingerprint
 *    does not cover the recipient blocks, so if a payload does not open, the next gateway's matching payload is tried
 *    with the same released key, after another fresh check.
 *
 * Nothing is decrypted unless every step passes.
 *
 * This work has been dedicated to the public domain under the CC0 1.0 Universal Public Domain Dedication.
 */

const { performance } = require('perf_hooks');
const { readClaimContext, checkRecord, sameInheritance, ClaimDenial } = require('./claim-context');
const { verifiedPayloads } = require('./arweave');
const { requestKeyRelease } = require('./key-release');
const { parseEnvelope, checkEnvelope, decryptAsset } = require('./envelope-v2');

// As in the app: a verified context is used only this long after its reads started
const MAX_CONTEXT_AGE_MS = 30_000;

/**
 * @param {object} options
 * @param {{environment: string, registry: string, keyProviderUrl: string, arweaveGateways?: string[]}} options.config
 * @param {'ethereum'|'arbitrum'} options.network
 * @param {string} options.inheritanceId
 * @param {{ethereum: {address: string, privateKey: string}, quantum: {privateKey: string}}} options.keys
 * @param {{ethereum: object, arbitrum?: object}} options.readers Two-provider readers per chain
 * @param {Function} [options.fetch]
 * @param {Function} [options.log]
 * @param {Function} [options.clock] Monotonic milliseconds, as performance.now()
 * @returns {Promise<{plaintext: Buffer, fileType: string|undefined, context: object}>}
 */
async function claimInheritance({ config, network, inheritanceId, keys, readers, fetch = globalThis.fetch, log = console.log, clock = () => performance.now() }) {
    const id = inheritanceId.toLowerCase();
    const readContext = () => readClaimContext({ environment: config.environment, registry: config.registry, network, inheritanceId: id, readers });

    log('Verifying the inheritance with two independent providers...');
    const context = await readContext();
    log(`   Contract ${context.contractAddress} (version ${context.latest.version}) via ${context.providers.join(' and ')}`);
    log(`   Finalized block ${context.finalized.block.number}, latest block ${context.latest.block.number}`);
    checkRecord(context, keys.ethereum.address);
    const record = context.latest.record;
    log('✅ Claimable at the finalized and the latest block, contract not paused');

    /** A fresh claim check of the same record on the same deployment. */
    const recheck = async () => {
        const fresh = await readContext();
        checkRecord(fresh, keys.ethereum.address);
        if (fresh.deploymentIdentity !== context.deploymentIdentity || !sameInheritance(fresh.latest.record, record)) {
            throw new ClaimDenial('record_changed');
        }
        return fresh;
    };

    // Payloads that match the fingerprint, gateway by gateway; each must parse and have a usable recipient
    log('Downloading the encrypted payload from Arweave...');
    const payloads = verifiedPayloads({
        arweaveTransactionId: record.arweaveTransactionId,
        expectedFingerprint: record.payloadFingerprint,
        gateways: config.arweaveGateways,
        fetch,
        log
    });
    let lastFailure = null;
    const nextEnvelope = async () => {
        for (;;) {
            const { value: payload, done } = await payloads.next();
            if (done) return null;
            try {
                const envelope = parseEnvelope(payload.json);
                checkEnvelope(envelope);
                log(`✅ Payload matches the on-chain fingerprint (from ${payload.gateway})`);
                return envelope;
            } catch (error) {
                lastFailure = error;
                log(`Arweave gateway ${payload.gateway}: ${error.message}`);
            }
        }
    };
    let envelope = await nextEnvelope();
    if (!envelope) throw lastFailure;

    log('Verifying the inheritance again before requesting the key...');
    const beforeRelease = await recheck();
    log('Requesting the wrapped key from the key provider...');
    const wrappedK = await requestKeyRelease({
        baseUrl: config.keyProviderUrl,
        chainId: beforeRelease.chainId,
        deploymentIdentity: beforeRelease.deploymentIdentity,
        inheritanceId: id,
        beneficiary: keys.ethereum.address,
        payloadFingerprint: record.payloadFingerprint,
        beneficiaryPrivateKey: keys.ethereum.privateKey,
        fetch
    });
    log('✅ Key released');

    while (envelope) {
        log('Verifying the inheritance again before decryption...');
        const fresh = await recheck();
        if (clock() - fresh.obtainedAt > MAX_CONTEXT_AGE_MS) throw new ClaimDenial('context_expired');
        log('Decrypting the asset...');
        try {
            const plaintext = decryptAsset(envelope, wrappedK, keys.quantum.privateKey, {
                deploymentIdentity: fresh.deploymentIdentity,
                inheritanceId: id,
                testator: record.testatorEOA,
                beneficiary: record.beneficiaryEOA,
                purpose: 'asset'
            });
            return { plaintext, fileType: envelope.fileType, context: fresh };
        } catch (error) {
            lastFailure = error;
            log(`${error.message}. Trying the next Arweave gateway...`);
        }
        envelope = await nextEnvelope();
    }
    throw lastFailure;
}

/**
 * The file name for a claimed asset. The envelope's fileType is not authenticated, so only a short alphanumeric
 * extension is used; anything else becomes "bin".
 */
function safeFileName(inheritanceId, fileType) {
    const extension = typeof fileType === 'string' && /^[A-Za-z0-9]{1,10}$/.test(fileType) ? fileType.toLowerCase() : 'bin';
    return `inheritance_${inheritanceId.slice(2, 10).toLowerCase()}.${extension}`;
}

module.exports = { MAX_CONTEXT_AGE_MS, claimInheritance, safeFileName };
