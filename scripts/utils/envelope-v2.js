/**
 * SPDX-License-Identifier: CC0-1.0
 *
 * Envelope version 2, as sealed by the iOS app (QSCryptionManager.swift):
 *
 * - The content is AES-256-GCM encrypted once with a random key K. Its authenticated data is the record context
 *   (shared-definitions.js, envelopeAuthenticatedData): deployment identity, inheritance ID, testator, beneficiary
 *   and purpose. A payload copied under another record, chain, deployment or purpose fails authentication.
 * - Each recipient wraps K. The external ML-KEM-768 recipient (used here) derives its key-encryption key with
 *   HKDF-SHA256 over the ML-KEM shared secret, info "wrap|v=1|kid=<kid>|alg=AES-256-GCM", and wraps K with AES-GCM
 *   under "recV=1|kid=<kid>|type=mlkem768|kem_hash=<b64 sha256(kem_ct)>|nonce=<b64 wrap nonce>".
 * - Asset envelopes on Arweave carry an empty wrappedK for this recipient: the key provider releases it after the
 *   claim. Metadata envelopes (on-chain testatorData) keep it.
 *
 * Only envelope version 2 with recipient version 1 is accepted; there is no code path for older envelopes.
 *
 * This work has been dedicated to the public domain under the CC0 1.0 Universal Public Domain Dedication.
 */

const crypto = require('crypto');
const { ml_kem768 } = require('@noble/post-quantum/ml-kem.js');
const { envelopeAuthenticatedData, isStandardBase64 } = require('./shared-definitions');

const ENVELOPE_VERSION = 2;
const RECIPIENT_VERSION = 1;
const EXTERNAL_RECIPIENT_TYPE = 'mlkem768';
const AES_GCM = 'AES-256-GCM';

const b64 = (buf) => Buffer.from(buf).toString('base64');

function fromB64(value, field) {
    if (!isStandardBase64(value)) {
        throw new Error(`Envelope field ${field} is not standard base64`);
    }
    return Buffer.from(value, 'base64');
}

/**
 * Parses an envelope (JSON text or Buffer) and checks its version and content fields.
 * @returns {object} the envelope with binary fields decoded
 */
function parseEnvelope(json) {
    let envelope;
    try {
        envelope = JSON.parse(Buffer.isBuffer(json) ? json.toString('utf8') : json);
    } catch {
        throw new Error('Envelope is not valid JSON');
    }
    if (envelope === null || typeof envelope !== 'object') throw new Error('Envelope is not an object');
    if (envelope.version !== ENVELOPE_VERSION) {
        throw new Error(`Unsupported envelope version: ${JSON.stringify(envelope.version)} (only version ${ENVELOPE_VERSION} is supported)`);
    }
    if (!Array.isArray(envelope.recipients)) throw new Error('Envelope has no recipients');
    const nonce = fromB64(envelope.nonce, 'nonce');
    const tag = fromB64(envelope.tag, 'tag');
    if (nonce.length !== 12 || tag.length !== 16) throw new Error('Envelope nonce or tag has the wrong size');
    return {
        version: envelope.version,
        ciphertext: fromB64(envelope.ciphertext, 'ciphertext'),
        nonce,
        tag,
        recipients: envelope.recipients,
        fileType: typeof envelope.fileType === 'string' ? envelope.fileType : undefined
    };
}

function externalRecipient(envelope) {
    const recipients = envelope.recipients.filter((r) => r && r.type === EXTERNAL_RECIPIENT_TYPE);
    if (recipients.length !== 1) throw new Error('Envelope must have exactly one ML-KEM-768 recipient');
    const recipient = recipients[0];
    if (recipient.recV !== RECIPIENT_VERSION) {
        throw new Error(`Unsupported recipient version: ${JSON.stringify(recipient.recV)}`);
    }
    if (typeof recipient.kid !== 'string' || !recipient.kid) throw new Error('ML-KEM-768 recipient has no kid');
    return {
        kid: recipient.kid,
        kemCt: fromB64(recipient.kem_ct, 'kem_ct'),
        salt: fromB64(recipient.salt, 'salt'),
        wrappedK: recipient.wrappedK === '' ? Buffer.alloc(0) : fromB64(recipient.wrappedK, 'wrappedK')
    };
}

function aesGcmOpen(key, nonce, ciphertext, tag, aad) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    decipher.setAAD(aad);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Unwraps the content key K for the ML-KEM-768 recipient. */
function unwrapContentKey(recipient, wrappedK, quantumPrivateKeyB64) {
    if (wrappedK.length !== 12 + 32 + 16) throw new Error('Wrapped key has the wrong size');
    const secretKey = fromB64(quantumPrivateKeyB64, 'quantum private key');
    const sharedSecret = Buffer.from(ml_kem768.decapsulate(recipient.kemCt, secretKey));
    const info = Buffer.from(`wrap|v=${RECIPIENT_VERSION}|kid=${recipient.kid}|alg=${AES_GCM}`, 'utf8');
    const kek = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, recipient.salt, info, 32));

    const nonce = wrappedK.subarray(0, 12);
    const kemHash = b64(crypto.createHash('sha256').update(recipient.kemCt).digest());
    const aad = Buffer.from(`recV=${RECIPIENT_VERSION}|kid=${recipient.kid}|type=${EXTERNAL_RECIPIENT_TYPE}|kem_hash=${kemHash}|nonce=${b64(nonce)}`, 'utf8');
    try {
        return aesGcmOpen(kek, nonce, wrappedK.subarray(12, -16), wrappedK.subarray(-16), aad);
    } catch {
        throw new Error('The wrapped key does not open with your quantum key (wrong key or tampered data)');
    }
}

function openContent(envelope, contentKey, context) {
    try {
        return aesGcmOpen(contentKey, envelope.nonce, envelope.ciphertext, envelope.tag, envelopeAuthenticatedData(context));
    } catch {
        throw new Error('The envelope does not open for this inheritance (wrong record, deployment or purpose, or tampered data)');
    }
}

/** Throws unless the envelope has a usable ML-KEM-768 recipient, before anything is requested for it. */
function checkEnvelope(envelope) {
    externalRecipient(envelope);
}

/**
 * Decrypts a claimed asset.
 * @param {object} envelope Parsed envelope (parseEnvelope) downloaded from Arweave and checked against the fingerprint
 * @param {Buffer} wrappedK The ML-KEM-768 recipient's wrapped key, released by the key provider
 * @param {string} quantumPrivateKeyB64 Base64 ML-KEM-768 private key
 * @param {object} context Envelope context with purpose "asset"
 * @returns {Buffer}
 */
function decryptAsset(envelope, wrappedK, quantumPrivateKeyB64, context) {
    if (context.purpose !== 'asset') throw new Error('Only an asset purpose opens an asset envelope');
    const recipient = externalRecipient(envelope);
    return openContent(envelope, unwrapContentKey(recipient, wrappedK, quantumPrivateKeyB64), context);
}

/**
 * Decrypts the testator's metadata (name and message) from the record's on-chain testatorData.
 * @param {string} testatorDataHex Hex of the envelope JSON, with or without 0x
 * @param {string} quantumPrivateKeyB64 Base64 ML-KEM-768 private key
 * @param {object} context Envelope context with purpose "metadata"
 * @returns {object} The decrypted metadata JSON
 */
function decryptMetadata(testatorDataHex, quantumPrivateKeyB64, context) {
    if (context.purpose !== 'metadata') throw new Error('Only a metadata purpose opens a metadata envelope');
    const hex = testatorDataHex.startsWith('0x') ? testatorDataHex.slice(2) : testatorDataHex;
    if (!/^([0-9a-fA-F]{2})+$/.test(hex)) throw new Error('testatorData is not hex');
    const envelope = parseEnvelope(Buffer.from(hex, 'hex'));
    const recipient = externalRecipient(envelope);
    const plaintext = openContent(envelope, unwrapContentKey(recipient, recipient.wrappedK, quantumPrivateKeyB64), context);
    try {
        return JSON.parse(plaintext.toString('utf8'));
    } catch {
        throw new Error('Decrypted metadata is not JSON');
    }
}

module.exports = {
    ENVELOPE_VERSION,
    RECIPIENT_VERSION,
    parseEnvelope,
    checkEnvelope,
    decryptAsset,
    decryptMetadata
};
