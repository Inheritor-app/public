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
