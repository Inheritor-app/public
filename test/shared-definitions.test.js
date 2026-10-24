// SPDX-License-Identifier: CC0-1.0
// The shared definitions must reproduce every value in the shared vectors (SolidityAndDashboard
// packages/contracts/spec/vectors.json) and the app's envelope v2 authenticated data.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    payloadFingerprint,
    deploymentIdentity,
    envelopeAuthenticatedData
} = require('../scripts/utils/shared-definitions');

const vectors = require('./fixtures/shared-vectors.json');
const aadVector = require('./fixtures/envelope-aad-vector.json');

test('payload fingerprint reproduces every valid shared vector', () => {
    assert.ok(vectors.payloadFingerprint.valid.length > 0);
    for (const vector of vectors.payloadFingerprint.valid) {
        assert.equal(payloadFingerprint(vector.envelopeJson), vector.expected, vector.name);
    }
});

test('payload fingerprint rejects every invalid shared vector on the named field', () => {
    for (const vector of vectors.payloadFingerprint.invalid) {
        assert.throws(() => payloadFingerprint(vector.envelopeJson), (error) => error.field === vector.error, vector.name);
    }
});

test('payload fingerprint handles a multi-megabyte ciphertext', () => {
    const { AbiCoder, keccak256 } = require('ethers');
    const nonce = Buffer.alloc(12, 1);
    const tag = Buffer.alloc(16, 2);
    const ciphertext = Buffer.alloc(8 * 1024 * 1024 + 1, 3);
    const envelope = { nonce: nonce.toString('base64'), tag: tag.toString('base64'), ciphertext: ciphertext.toString('base64') };
    const expected = keccak256(AbiCoder.defaultAbiCoder().encode(['string', 'bytes12', 'bytes', 'bytes16'], ['INHERITOR_PAYLOAD_FP_V1', nonce, ciphertext, tag]));
    assert.equal(payloadFingerprint(JSON.stringify(envelope)), expected);
    // Still strict on large inputs
    assert.throws(() => payloadFingerprint({ ...envelope, ciphertext: envelope.ciphertext.slice(0, -1) + '_' }), (error) => error.field === 'ciphertext');
    assert.throws(() => payloadFingerprint({ ...envelope, ciphertext: '=' + envelope.ciphertext.slice(1) }), (error) => error.field === 'ciphertext');
});

test('standard base64 means padded, without base64url characters or misplaced padding', () => {
    const { isStandardBase64 } = require('../scripts/utils/shared-definitions');
    for (const ok of ['', 'QQ==', 'QUI=', 'QUJD', 'a+/b']) assert.equal(isStandardBase64(ok), true, ok);
    for (const bad of ['QQ', 'QQ=', 'Q===', 'QQ==QUJD', 'ab-_', 'QU=D', ' QUJD', 'QUJD\n', 7, null]) assert.equal(isStandardBase64(bad), false, String(bad));
});

test('deployment identity reproduces every valid shared vector', () => {
    for (const vector of vectors.deploymentIdentity.valid) {
        assert.equal(deploymentIdentity(vector.input), vector.expected, vector.name);
    }
});

test('deployment identity rejects every invalid shared vector on the named field', () => {
    for (const vector of vectors.deploymentIdentity.invalid) {
        assert.throws(() => deploymentIdentity(vector.input), (error) => error.field === vector.error, vector.name);
    }
});

test('envelope v2 authenticated data matches the app for both purposes', () => {
    for (const purpose of ['asset', 'metadata']) {
        const aad = envelopeAuthenticatedData({
            deploymentIdentity: aadVector.deploymentIdentity,
            inheritanceId: aadVector.inheritanceId,
            testator: aadVector.testator,
            beneficiary: aadVector.beneficiary,
            purpose
        });
        assert.equal('0x' + aad.toString('hex'), aadVector[purpose], purpose);
    }
});

test('envelope v2 authenticated data rejects malformed contexts', () => {
    const base = {
        deploymentIdentity: aadVector.deploymentIdentity,
        inheritanceId: aadVector.inheritanceId,
        testator: aadVector.testator,
        beneficiary: aadVector.beneficiary,
        purpose: 'asset'
    };
    assert.throws(() => envelopeAuthenticatedData({ ...base, purpose: 'other' }));
    assert.throws(() => envelopeAuthenticatedData({ ...base, inheritanceId: '0x1234' }));
    assert.throws(() => envelopeAuthenticatedData({ ...base, inheritanceId: '0x' + '0'.repeat(64) }));
    assert.throws(() => envelopeAuthenticatedData({ ...base, testator: '0x1234' }));
    assert.throws(() => envelopeAuthenticatedData({ ...base, deploymentIdentity: '0x12' }));
});
