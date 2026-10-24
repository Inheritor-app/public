// SPDX-License-Identifier: CC0-1.0
// Release requests must reproduce the key provider's v2 signing vector (key-provider docs/key-requests-v2.md).

const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');

const {
    KEY_PROVIDER_DOMAIN,
    releaseDigest,
    signReleaseRequest,
    requestKeyRelease,
    KeyReleaseError
} = require('../scripts/utils/key-release');

const vector = require('./fixtures/key-release-vector.json');

test('the EIP-712 domain separator matches the worker', () => {
    assert.deepEqual(KEY_PROVIDER_DOMAIN, vector.eip712Domain);
    assert.equal(ethers.TypedDataEncoder.hashDomain(KEY_PROVIDER_DOMAIN), vector.domainSeparator);
});

test('the release digest and signature reproduce the worker vector', async () => {
    assert.equal(releaseDigest(vector.release), vector.releaseDigest);
    const wallet = new ethers.Wallet(vector.beneficiaryPrivateKey);
    assert.equal(wallet.address, vector.beneficiary);
    const body = await signReleaseRequest({ chainId: 1, ...vector.release }, vector.beneficiaryPrivateKey);
    assert.equal(body.signature, vector.releaseSignature);
    assert.deepEqual(Object.keys(body).sort(), [
        'beneficiary', 'chainId', 'deploymentIdentity', 'inheritanceId', 'payloadFingerprint', 'requestVersion', 'signature', 'timestamp'
    ]);
    assert.equal(body.requestVersion, 2);
    assert.equal(body.chainId, 1);
    assert.equal(body.timestamp, vector.release.timestamp);
});

test('a release request refuses a signing key that is not the beneficiary', async () => {
    const other = ethers.Wallet.createRandom();
    await assert.rejects(signReleaseRequest({ chainId: 1, ...vector.release }, other.privateKey), /beneficiary/);
});

function jsonResponse(status, body, headers = {}) {
    return { status, headers: new Map(Object.entries(headers)), text: async () => JSON.stringify(body) };
}

const fetcher = (response, seen = []) => async (url, init) => {
    seen.push({ url, body: JSON.parse(init.body), method: init.method });
    return response;
};

test('the released key is returned only for the requested identity and inheritance', async () => {
    const seen = [];
    const released = await requestKeyRelease({
        baseUrl: 'https://worker.test',
        chainId: 1,
        ...vector.release,
        beneficiaryPrivateKey: vector.beneficiaryPrivateKey,
        now: () => vector.release.timestamp,
        fetch: fetcher(jsonResponse(200, {
            encryptedSymmetricKey: Buffer.from('wrapped').toString('base64'),
            deploymentIdentity: vector.release.deploymentIdentity.toUpperCase().replace('0X', '0x'),
            inheritanceId: vector.release.inheritanceId,
            verifiedAt: {}
        }), seen)
    });
    assert.equal(released.toString(), 'wrapped');
    assert.equal(seen[0].url, 'https://worker.test/v2/release');
    assert.equal(seen[0].method, 'POST');
    assert.equal(seen[0].body.signature, vector.releaseSignature);

    await assert.rejects(requestKeyRelease({
        baseUrl: 'https://worker.test',
        chainId: 1,
        ...vector.release,
        beneficiaryPrivateKey: vector.beneficiaryPrivateKey,
        now: () => vector.release.timestamp,
        fetch: fetcher(jsonResponse(200, {
            encryptedSymmetricKey: Buffer.from('wrapped').toString('base64'),
            deploymentIdentity: '0x' + '11'.repeat(32),
            inheritanceId: vector.release.inheritanceId
        }))
    }), (error) => error instanceof KeyReleaseError && error.code === 'response_mismatch');
});

test('worker refusals surface their code, state and retry time', async () => {
    const base = {
        baseUrl: 'https://worker.test',
        chainId: 1,
        ...vector.release,
        beneficiaryPrivateKey: vector.beneficiaryPrivateKey,
        now: () => vector.release.timestamp
    };
    await assert.rejects(
        requestKeyRelease({ ...base, fetch: fetcher(jsonResponse(403, { error: 'not_claimable', state: { finalized: 0, latest: 1 } })) }),
        (error) => error.code === 'not_claimable' && error.status === 403 && error.state.latest === 1
    );
    await assert.rejects(
        requestKeyRelease({ ...base, fetch: fetcher(jsonResponse(429, { error: 'rate_limited', retryAfter: 42 }, { 'retry-after': '42' })) }),
        (error) => error.code === 'rate_limited' && error.retryAfter === 42
    );
    await assert.rejects(
        requestKeyRelease({ ...base, fetch: fetcher(jsonResponse(200, { encryptedSymmetricKey: 'not base64!', deploymentIdentity: base.deploymentIdentity, inheritanceId: base.inheritanceId })) }),
        (error) => error.code === 'malformed_response'
    );
});
