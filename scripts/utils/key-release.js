/**
 * SPDX-License-Identifier: CC0-1.0
 *
 * Key release from the Inheritor key provider, request version 2 (key-provider docs/key-requests-v2.md).
 *
 * The beneficiary signs an EIP-712 ReleaseKey message under the key provider's own domain
 * {name: "Inheritor Key Provider", version: "2"} and posts it to /v2/release. The message binds the deployment
 * identity, the inheritance, the beneficiary, the fingerprint of the payload the beneficiary downloaded and verified,
 * and a timestamp (the worker accepts ±300 s). The worker releases the wrapped key only when the record is
 * Claimable at both the finalized and the latest block.
 *
 * This work has been dedicated to the public domain under the CC0 1.0 Universal Public Domain Dedication.
 */

const { ethers } = require('ethers');
const { isStandardBase64 } = require('./shared-definitions');
const { readBodyBounded } = require('./bounded-body');

const MAX_RESPONSE_BYTES = 64 * 1024;
// Covers the request and reading the answer
const TIMEOUT_MS = 30 * 1000;

const KEY_PROVIDER_DOMAIN = { name: 'Inheritor Key Provider', version: '2' };

const RELEASE_TYPES = {
    ReleaseKey: [
        { name: 'deploymentIdentity', type: 'bytes32' },
        { name: 'inheritanceId', type: 'bytes32' },
        { name: 'beneficiary', type: 'address' },
        { name: 'payloadFingerprint', type: 'bytes32' },
        { name: 'timestamp', type: 'uint256' }
    ]
};

const MESSAGES = {
    not_claimable: 'The key provider does not see the inheritance as Claimable at both the finalized and the latest block yet. Try again in about 15–20 minutes.',
    key_not_found: 'The key provider has no key for this inheritance on this deployment.',
    signer_not_beneficiary: 'The key provider does not accept your key as the beneficiary of this inheritance.',
    deployment_mismatch: 'The key provider stored this key for another deployment.',
    fingerprint_mismatch: 'The key provider stored this key for another payload.',
    record_mismatch: 'The on-chain record does not match what the key provider stored.',
    contract_paused: 'The Inheritor contract is paused.',
    rate_limited: 'The key provider is rate limiting requests.',
    invalid_signature: 'The key provider rejected the request signature or its timestamp. Check that your computer clock is correct.',
    chain_verification_failed: 'The key provider could not verify the chain right now. Try again later.'
};

class KeyReleaseError extends Error {
    constructor(code, details = {}) {
        super(details.message || MESSAGES[code] || `Key provider refused the release (${code})`);
        this.code = code;
        Object.assign(this, details);
    }
}

function releaseMessage({ deploymentIdentity, inheritanceId, beneficiary, payloadFingerprint, timestamp }) {
    return { deploymentIdentity, inheritanceId, beneficiary: ethers.getAddress(beneficiary), payloadFingerprint, timestamp };
}

/** The EIP-712 digest the beneficiary signs. */
function releaseDigest(fields) {
    return ethers.TypedDataEncoder.hash(KEY_PROVIDER_DOMAIN, RELEASE_TYPES, releaseMessage(fields));
}

/**
 * Builds and signs the /v2/release body.
 * @param {{chainId: number, deploymentIdentity: string, inheritanceId: string, beneficiary: string, payloadFingerprint: string, timestamp: number}} fields
 * @param {string} beneficiaryPrivateKey 0x-prefixed private key of the beneficiary's EOA
 */
async function signReleaseRequest(fields, beneficiaryPrivateKey) {
    const wallet = new ethers.Wallet(beneficiaryPrivateKey);
    const message = releaseMessage(fields);
    if (wallet.address !== message.beneficiary) {
        throw new Error('The signing key is not the beneficiary named in the release request');
    }
    const signature = await wallet.signTypedData(KEY_PROVIDER_DOMAIN, RELEASE_TYPES, message);
    return {
        requestVersion: 2,
        chainId: Number(fields.chainId),
        deploymentIdentity: message.deploymentIdentity,
        inheritanceId: message.inheritanceId,
        beneficiary: message.beneficiary,
        payloadFingerprint: message.payloadFingerprint,
        timestamp: Number(message.timestamp),
        signature
    };
}

/**
 * Requests the wrapped key. Returns the decoded bytes of `encryptedSymmetricKey`.
 * @param {object} options baseUrl, chainId, deploymentIdentity, inheritanceId, beneficiary, payloadFingerprint,
 *     beneficiaryPrivateKey, and optionally fetch, now (unix seconds) and timeoutMs
 */
async function requestKeyRelease({ baseUrl, beneficiaryPrivateKey, fetch = globalThis.fetch, now = () => Math.floor(Date.now() / 1000), timeoutMs = TIMEOUT_MS, ...fields }) {
    const body = await signReleaseRequest({ ...fields, timestamp: now() }, beneficiaryPrivateKey);
    const url = `${baseUrl.replace(/\/+$/, '')}/v2/release`;

    let response;
    let text;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            redirect: 'error',
            signal: AbortSignal.timeout(timeoutMs)
        });
        text = (await readBodyBounded(response, MAX_RESPONSE_BYTES)).toString('utf8');
    } catch (error) {
        throw new KeyReleaseError('unavailable', { message: `The key provider did not answer: ${error.message}` });
    }

    let reply = null;
    try {
        reply = JSON.parse(text);
    } catch {
        // handled below
    }

    if (response.status !== 200) {
        const code = (reply && typeof reply.error === 'string') ? reply.error : `http_${response.status}`;
        const header = response.headers.get('retry-after');
        throw new KeyReleaseError(code, {
            status: response.status,
            state: reply && reply.state,
            field: reply && reply.field,
            retryAfter: reply && Number.isFinite(reply.retryAfter) ? reply.retryAfter : (header ? Number(header) : undefined)
        });
    }

    if (!reply || !isStandardBase64(reply.encryptedSymmetricKey) ||
        reply.encryptedSymmetricKey.length === 0) {
        throw new KeyReleaseError('malformed_response', { message: 'The key provider returned no valid key' });
    }
    if (typeof reply.deploymentIdentity !== 'string' || typeof reply.inheritanceId !== 'string' ||
        reply.deploymentIdentity.toLowerCase() !== body.deploymentIdentity.toLowerCase() ||
        reply.inheritanceId.toLowerCase() !== body.inheritanceId.toLowerCase()) {
        throw new KeyReleaseError('response_mismatch', { message: 'The key provider answered for another deployment or inheritance' });
    }
    return Buffer.from(reply.encryptedSymmetricKey, 'base64');
}

module.exports = {
    KEY_PROVIDER_DOMAIN,
    RELEASE_TYPES,
    KeyReleaseError,
    releaseDigest,
    signReleaseRequest,
    requestKeyRelease
};
