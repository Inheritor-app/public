// SPDX-License-Identifier: CC0-1.0
// Envelope v2: the content AEAD authenticates the record context (app SharedDefinitions.swift, EnvelopeContext).

const test = require('node:test');
const assert = require('node:assert/strict');

const { decryptAsset, decryptMetadata, parseEnvelope } = require('../scripts/utils/envelope-v2');
const { payloadFingerprint } = require('../scripts/utils/shared-definitions');
const { buildVector, vectorSecretKey } = require('./fixtures/generate-envelope-v2-vector');
const vector = require('./fixtures/envelope-v2-vector.json');

const secretKey = vectorSecretKey().toString('base64');
const assetContext = { ...vector.context, purpose: 'asset' };
const metadataContext = { ...vector.context, purpose: 'metadata' };
const releasedWrappedK = Buffer.from(vector.asset.releasedWrappedK, 'base64');

test('the committed vector is what the generator produces', () => {
    assert.deepEqual(buildVector(), vector);
    assert.equal(payloadFingerprint(vector.asset.arweaveEnvelopeJson), vector.asset.payloadFingerprint);
});

test('the asset envelope opens with the released wrappedK under the asset context', () => {
    const envelope = parseEnvelope(vector.asset.arweaveEnvelopeJson);
    const plaintext = decryptAsset(envelope, releasedWrappedK, secretKey, assetContext);
    assert.equal(plaintext.toString('utf8'), vector.asset.plaintext);
});

test('the metadata envelope opens under the metadata context', () => {
    const data = decryptMetadata(vector.metadata.testatorDataHex, secretKey, metadataContext);
    assert.deepEqual(data, JSON.parse(vector.metadata.plaintext));
});

test('an envelope does not open under any other context', () => {
    const envelope = parseEnvelope(vector.asset.arweaveEnvelopeJson);
    const others = {
        'metadata purpose': { ...assetContext, purpose: 'metadata' },
        'other deployment': { ...assetContext, deploymentIdentity: '0x' + 'ab'.repeat(32) },
        'other inheritance': { ...assetContext, inheritanceId: '0x' + 'cd'.repeat(32) },
        'other testator': { ...assetContext, testator: vector.context.beneficiary },
        'other beneficiary': { ...assetContext, beneficiary: vector.context.testator }
    };
    for (const [name, context] of Object.entries(others)) {
        assert.throws(() => decryptAsset(envelope, releasedWrappedK, secretKey, context), name);
    }
    assert.throws(() => decryptMetadata(vector.metadata.testatorDataHex, secretKey, assetContext), /purpose/);
    assert.throws(() => decryptAsset(envelope, releasedWrappedK, secretKey, metadataContext), /purpose/);
});

test('only envelope version 2 and recipient version 1 are accepted', () => {
    const json = JSON.parse(vector.asset.arweaveEnvelopeJson);
    for (const version of [1, 3, '2', undefined]) {
        assert.throws(() => parseEnvelope(JSON.stringify({ ...json, version })), /version/, String(version));
    }
    const recipients = json.recipients.map((r) => (r.type === 'mlkem768' ? { ...r, recV: 2 } : r));
    const envelope = parseEnvelope(JSON.stringify({ ...json, recipients }));
    assert.throws(() => decryptAsset(envelope, releasedWrappedK, secretKey, assetContext), /recipient version/);
});

test('a tampered wrappedK or ciphertext fails', () => {
    const envelope = parseEnvelope(vector.asset.arweaveEnvelopeJson);
    const flipped = Buffer.from(releasedWrappedK);
    flipped[20] ^= 1;
    assert.throws(() => decryptAsset(envelope, flipped, secretKey, assetContext));

    const json = JSON.parse(vector.asset.arweaveEnvelopeJson);
    const ciphertext = Buffer.from(json.ciphertext, 'base64');
    ciphertext[0] ^= 1;
    assert.throws(() => decryptAsset(parseEnvelope(JSON.stringify({ ...json, ciphertext: ciphertext.toString('base64') })), releasedWrappedK, secretKey, assetContext));
});
