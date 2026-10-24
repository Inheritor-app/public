/**
 * SPDX-License-Identifier: CC0-1.0
 *
 * Definitions shared with the Inheritor contract, the iOS app and the key provider.
 * Every value must match the shared test vectors (see test/fixtures).
 *
 * This work has been dedicated to the public domain under the CC0 1.0 Universal Public Domain Dedication.
 *
 * - Payload fingerprint: commitment to an encrypted payload's content AEAD fields, stored on-chain.
 *       keccak256(abi.encode(string "INHERITOR_PAYLOAD_FP_V1", bytes12 nonce, bytes ciphertext, bytes16 tag))
 * - Deployment identity: one Inheritor deployment (environment, chain and contract).
 *       keccak256(abi.encode(string "INHERITOR_DEPLOYMENT_V1", string environment, uint256 chainId, address verifyingContract))
 * - Envelope v2 authenticated data: the record an envelope belongs to, bound into the content AEAD.
 *       keccak256(abi.encode(string "INHERITOR_ENVELOPE_V2", bytes32 deploymentIdentity, bytes32 inheritanceId,
 *                            address testator, address beneficiary, string purpose))
 */

const { AbiCoder, keccak256, getAddress, ZeroAddress, ZeroHash } = require('ethers');

const PAYLOAD_FP_DOMAIN = 'INHERITOR_PAYLOAD_FP_V1';
const DEPLOYMENT_DOMAIN = 'INHERITOR_DEPLOYMENT_V1';
const ENVELOPE_DOMAIN = 'INHERITOR_ENVELOPE_V2';
const ENVIRONMENTS = ['production', 'test'];
const ENVELOPE_PURPOSES = ['asset', 'metadata'];

const STANDARD_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;

/** A validation error naming the rejected field, as the shared vectors do. */
class DefinitionError extends Error {
    constructor(field, message) {
        super(`${field}: ${message}`);
        this.field = field;
    }
}

const abi = AbiCoder.defaultAbiCoder();

function decodeBase64Field(envelope, name) {
    const value = envelope[name];
    if (typeof value !== 'string' || !STANDARD_BASE64.test(value)) {
        throw new DefinitionError(name, 'missing or not standard base64');
    }
    return Buffer.from(value, 'base64');
}

/**
 * @param {string|object} envelope Encrypted envelope as JSON text or parsed object
 * @returns {string} 0x-prefixed 32-byte fingerprint
 */
function payloadFingerprint(envelope) {
    let env = envelope;
    if (typeof envelope === 'string') {
        try {
            env = JSON.parse(envelope);
        } catch {
            throw new DefinitionError('envelope', 'not JSON');
        }
    }
    if (env === null || typeof env !== 'object' || Array.isArray(env)) {
        throw new DefinitionError('envelope', 'not an object');
    }

    const nonce = decodeBase64Field(env, 'nonce');
    if (nonce.length !== 12) throw new DefinitionError('nonce', `expected 12 bytes, got ${nonce.length}`);
    const tag = decodeBase64Field(env, 'tag');
    if (tag.length !== 16) throw new DefinitionError('tag', `expected 16 bytes, got ${tag.length}`);
    const ciphertext = decodeBase64Field(env, 'ciphertext');
    if (ciphertext.length === 0) throw new DefinitionError('ciphertext', 'empty');

    return keccak256(abi.encode(['string', 'bytes12', 'bytes', 'bytes16'], [PAYLOAD_FP_DOMAIN, nonce, ciphertext, tag]));
}

/**
 * @param {{environment: string, chainId: number|bigint|string, verifyingContract: string}} input
 * @returns {string} 0x-prefixed 32-byte identity
 */
function deploymentIdentity({ environment, chainId, verifyingContract }) {
    if (!ENVIRONMENTS.includes(environment)) {
        throw new DefinitionError('environment', `must be one of ${ENVIRONMENTS.join(', ')}`);
    }
    let chain;
    try {
        chain = BigInt(chainId);
    } catch {
        throw new DefinitionError('chainId', 'not an integer');
    }
    if (chain <= 0n) throw new DefinitionError('chainId', 'must be positive');

    let contract;
    try {
        contract = getAddress(verifyingContract);
    } catch {
        throw new DefinitionError('verifyingContract', 'not a valid address');
    }
    if (contract === ZeroAddress) throw new DefinitionError('verifyingContract', 'zero address');

    return keccak256(abi.encode(['string', 'string', 'uint256', 'address'], [DEPLOYMENT_DOMAIN, environment, chain, contract]));
}

/**
 * The content AEAD's authenticated data for an envelope v2: 32 raw bytes.
 * @param {{deploymentIdentity: string, inheritanceId: string, testator: string, beneficiary: string, purpose: string}} context
 * @returns {Buffer}
 */
function envelopeAuthenticatedData({ deploymentIdentity: identity, inheritanceId, testator, beneficiary, purpose }) {
    if (typeof identity !== 'string' || !BYTES32.test(identity)) {
        throw new DefinitionError('deploymentIdentity', 'expected 32 bytes of hex');
    }
    if (typeof inheritanceId !== 'string' || !BYTES32.test(inheritanceId) || inheritanceId.toLowerCase() === ZeroHash) {
        throw new DefinitionError('inheritanceId', 'expected a non-zero 32-byte hex value');
    }
    if (!ENVELOPE_PURPOSES.includes(purpose)) {
        throw new DefinitionError('purpose', `must be one of ${ENVELOPE_PURPOSES.join(', ')}`);
    }
    const address = (field, value) => {
        try {
            return getAddress(value);
        } catch {
            throw new DefinitionError(field, 'not a valid address');
        }
    };
    const encoded = abi.encode(
        ['string', 'bytes32', 'bytes32', 'address', 'address', 'string'],
        [ENVELOPE_DOMAIN, identity, inheritanceId, address('testator', testator), address('beneficiary', beneficiary), purpose]
    );
    return Buffer.from(keccak256(encoded).slice(2), 'hex');
}

module.exports = {
    PAYLOAD_FP_DOMAIN,
    DEPLOYMENT_DOMAIN,
    ENVELOPE_DOMAIN,
    ENVIRONMENTS,
    ENVELOPE_PURPOSES,
    STANDARD_BASE64,
    DefinitionError,
    payloadFingerprint,
    deploymentIdentity,
    envelopeAuthenticatedData
};
