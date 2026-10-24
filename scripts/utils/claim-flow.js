/**
 * SPDX-License-Identifier: CC0-1.0
 *
 * The beneficiary's claim of a v3 inheritance with envelope v2:
 *
 * 1. Verified claim check: registry, contract version, pause flag and record at the finalized and the latest block,
 *    agreed by two independent providers (claim-context.js).
 * 2. Download the payload from Arweave and accept it only if it matches the on-chain payloadFingerprint.
 * 3. Request the wrapped key from the key provider with a signed v2 release request.
 * 4. Run the claim check again, so a check-in, revocation or pause during the download or the release stops the
 *    claim, and require the same record.
 * 5. Decrypt the asset under the envelope v2 context of the verified record, with purpose "asset".
 *
 * Nothing is decrypted unless every step passes.
 *
 * This work has been dedicated to the public domain under the CC0 1.0 Universal Public Domain Dedication.
 */

const { readClaimContext, checkRecord, sameInheritance, ClaimDenial } = require('./claim-context');
const { downloadVerifiedPayload } = require('./arweave');
const { requestKeyRelease } = require('./key-release');
const { parseEnvelope, decryptAsset } = require('./envelope-v2');

/**
 * @param {object} options
 * @param {{environment: string, registry: string, keyProviderUrl: string, arweaveGateways?: string[]}} options.config
 * @param {'ethereum'|'arbitrum'} options.network
 * @param {string} options.inheritanceId
 * @param {{ethereum: {address: string, privateKey: string}, quantum: {privateKey: string}}} options.keys
 * @param {{ethereum: object, arbitrum?: object}} options.readers Two-provider readers per chain
 * @param {Function} [options.fetch]
 * @param {Function} [options.log]
 * @returns {Promise<{plaintext: Buffer, fileType: string|undefined, context: object}>}
 */
async function claimInheritance({ config, network, inheritanceId, keys, readers, fetch = globalThis.fetch, log = console.log }) {
    const id = inheritanceId.toLowerCase();
    const readContext = () => readClaimContext({ environment: config.environment, registry: config.registry, network, inheritanceId: id, readers });

    log('Verifying the inheritance with two independent providers...');
    const context = await readContext();
    log(`   Contract ${context.contractAddress} (version ${context.latest.version}) via ${context.providers.join(' and ')}`);
    log(`   Finalized block ${context.finalized.block.number}, latest block ${context.latest.block.number}`);
    checkRecord(context, keys.ethereum.address);
    const record = context.latest.record;
    log('✅ Claimable at the finalized and the latest block, contract not paused');

    log('Downloading the encrypted payload from Arweave...');
    const payload = await downloadVerifiedPayload({
        arweaveTransactionId: record.arweaveTransactionId,
        expectedFingerprint: record.payloadFingerprint,
        gateways: config.arweaveGateways,
        fetch,
        log
    });
    const envelope = parseEnvelope(payload.json);
    log(`✅ Payload matches the on-chain fingerprint (from ${payload.gateway})`);

    log('Requesting the wrapped key from the key provider...');
    const wrappedK = await requestKeyRelease({
        baseUrl: config.keyProviderUrl,
        chainId: context.chainId,
        deploymentIdentity: context.deploymentIdentity,
        inheritanceId: id,
        beneficiary: keys.ethereum.address,
        payloadFingerprint: record.payloadFingerprint,
        beneficiaryPrivateKey: keys.ethereum.privateKey,
        fetch
    });
    log('✅ Key released');

    log('Verifying the inheritance again before decryption...');
    const recheck = await readContext();
    checkRecord(recheck, keys.ethereum.address);
    if (recheck.deploymentIdentity !== context.deploymentIdentity || !sameInheritance(recheck.latest.record, record)) {
        throw new ClaimDenial('record_changed');
    }

    log('Decrypting the asset...');
    const plaintext = decryptAsset(envelope, wrappedK, keys.quantum.privateKey, {
        deploymentIdentity: recheck.deploymentIdentity,
        inheritanceId: id,
        testator: record.testatorEOA,
        beneficiary: record.beneficiaryEOA,
        purpose: 'asset'
    });
    return { plaintext, fileType: envelope.fileType, context: recheck };
}

/**
 * The file name for a claimed asset. The envelope's fileType is not authenticated, so only a short alphanumeric
 * extension is used; anything else becomes "bin".
 */
function safeFileName(inheritanceId, fileType) {
    const extension = typeof fileType === 'string' && /^[A-Za-z0-9]{1,10}$/.test(fileType) ? fileType.toLowerCase() : 'bin';
    return `inheritance_${inheritanceId.slice(2, 10).toLowerCase()}.${extension}`;
}

module.exports = { claimInheritance, safeFileName };
