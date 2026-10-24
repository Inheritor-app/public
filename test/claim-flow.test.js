// SPDX-License-Identifier: CC0-1.0
// The whole claim with mocked providers, key provider and Arweave: verified record, verified payload, released key,
// re-verified record, decrypted asset.

const test = require('node:test');
const assert = require('node:assert/strict');

const { claimInheritance, safeFileName } = require('../scripts/utils/claim-flow');
const { TwoProviderReader } = require('../scripts/utils/chain-reader');
const { readBeneficiaryRecords } = require('../scripts/utils/claim-context');
const { decryptMetadata } = require('../scripts/utils/envelope-v2');
const { buildClaimFixture } = require('./support/claim-fixture');

function readersFor(chain, views = {}) {
    return {
        ethereum: new TwoProviderReader({
            chainId: 1,
            providers: [chain.provider('Operator A', views.a), chain.provider('Operator B', views.b)],
            policy: { retryDelayMs: 1 }
        })
    };
}

function run(fixture, { chain = fixture.chain(), readers = readersFor(chain), workerDouble = fixture.worker(), gateways } = {}) {
    return claimInheritance({
        config: fixture.config,
        network: 'ethereum',
        inheritanceId: fixture.inheritanceId,
        keys: fixture.keys,
        readers,
        fetch: fixture.fetchDouble({ workerDouble, gateways }),
        log: () => {}
    });
}

test('a Claimable v3 inheritance with a matching payload is claimed and decrypted', async () => {
    const fixture = buildClaimFixture();
    const workerDouble = fixture.worker();
    const chain = fixture.chain();
    const a = chain.provider('Operator A');
    const b = chain.provider('Operator B');
    const result = await run(fixture, { workerDouble, readers: { ethereum: new TwoProviderReader({ chainId: 1, providers: [a, b], policy: { retryDelayMs: 1 } }) } });
    assert.deepEqual(result.plaintext, fixture.plaintext);
    assert.equal(result.fileType, 'pdf');
    assert.equal(workerDouble.requests.length, 1);
    assert.equal(workerDouble.requests[0].payloadFingerprint, fixture.record.payloadFingerprint);
    // The context is read twice, before the download and again after the key is released. Each read is the
    // registry at both blocks, then registry, record, pause flag and version at both blocks.
    const calls = a.requests.filter((r) => r.method === 'eth_call').length;
    assert.equal(calls, 2 * (2 + 4 * 2));
});

test('a record that is not yet Claimable at the finalized block is not claimed and no key is requested', async () => {
    const fixture = buildClaimFixture();
    const workerDouble = fixture.worker();
    await assert.rejects(run(fixture, { chain: fixture.chain({ finalized: { record: { state: 0 } } }), workerDouble }), (error) => error.code === 'awaiting_finality');
    assert.equal(workerDouble.requests.length, 0);
});

test('a paused contract, a newer contract version or disagreeing providers stop the claim before any download', async () => {
    const fixture = buildClaimFixture();
    const workerDouble = fixture.worker();
    await assert.rejects(run(fixture, { chain: fixture.chain({ latest: { paused: true } }), workerDouble }), (error) => error.code === 'contract_paused');
    await assert.rejects(run(fixture, { chain: fixture.chain({ finalized: { version: '4.0' }, latest: { version: '4.0' } }), workerDouble }), (error) => error.code === 'update_required');

    const chain = fixture.chain();
    const lying = { state: (block) => ({ ...block.state, inheritors: {} }) };
    await assert.rejects(run(fixture, { chain, readers: readersFor(chain, { b: lying }), workerDouble }), (error) => error.code === 'providers_disagree');
    assert.equal(workerDouble.requests.length, 0);
});

test('a payload that does not match the on-chain fingerprint is refused, and another gateway is tried', async () => {
    const fixture = buildClaimFixture();
    const tampered = JSON.parse(fixture.arweaveJson);
    tampered.tag = Buffer.alloc(16, 7).toString('base64');
    const workerDouble = fixture.worker();
    await assert.rejects(
        run(fixture, { workerDouble, gateways: { 'https://arweave.test': JSON.stringify(tampered) } }),
        (error) => error.code === 'fingerprint_mismatch'
    );
    assert.equal(workerDouble.requests.length, 0);

    const config = { ...fixture.config, arweaveGateways: ['https://bad.test', 'https://arweave.test'] };
    const result = await claimInheritance({
        config, network: 'ethereum', inheritanceId: fixture.inheritanceId, keys: fixture.keys,
        readers: readersFor(fixture.chain()), log: () => {},
        fetch: fixture.fetchDouble({ workerDouble, gateways: { 'https://bad.test': JSON.stringify(tampered), 'https://arweave.test': fixture.arweaveJson } })
    });
    assert.deepEqual(result.plaintext, fixture.plaintext);
});

test('a worker refusal is reported with its code', async () => {
    const fixture = buildClaimFixture();
    const workerDouble = fixture.worker({ refuse: { status: 403, body: { error: 'not_claimable', state: { finalized: 0, latest: 1 } } } });
    await assert.rejects(run(fixture, { workerDouble }), (error) => error.code === 'not_claimable' && error.state.finalized === 0);
});

test('a check-in between the key release and decryption stops the claim', async () => {
    const fixture = buildClaimFixture();
    const chain = fixture.chain();
    const workerDouble = fixture.worker();
    const original = workerDouble.handle;
    workerDouble.handle = async (body) => {
        const reply = await original(body);
        // The testator checks in: the record returns to Designated at the latest block.
        const latest = chain.blocks.get(chain.heads.latest);
        const contract = Object.values(latest.state.inheritors)[0];
        contract.records = { [fixture.inheritanceId.toLowerCase()]: { ...fixture.record, state: 0 } };
        return reply;
    };
    await assert.rejects(run(fixture, { chain, workerDouble }), (error) => error.code === 'not_claimable');
});

test('keys of another beneficiary are refused before anything is downloaded', async () => {
    const fixture = buildClaimFixture();
    const other = buildClaimFixture();
    const workerDouble = fixture.worker();
    await assert.rejects(claimInheritance({
        config: fixture.config, network: 'ethereum', inheritanceId: fixture.inheritanceId, keys: other.keys,
        readers: readersFor(fixture.chain()), fetch: fixture.fetchDouble({ workerDouble }), log: () => {}
    }), (error) => error.code === 'not_beneficiary');
    assert.equal(workerDouble.requests.length, 0);
});

test('the testator\'s name and message decrypt from the verified listing under the metadata context', async () => {
    const fixture = buildClaimFixture();
    const listing = await readBeneficiaryRecords({
        environment: 'production', registry: fixture.config.registry, network: 'ethereum',
        beneficiary: fixture.beneficiary.address, readers: readersFor(fixture.chain())
    });
    assert.equal(listing.deploymentIdentity, fixture.identity);
    const [record] = listing.records;
    const context = {
        deploymentIdentity: listing.deploymentIdentity, inheritanceId: record.inheritanceId,
        testator: record.testatorEOA, beneficiary: record.beneficiaryEOA, purpose: 'metadata'
    };
    assert.deepEqual(decryptMetadata(record.testatorData, fixture.keys.quantum.privateKey, context), { name: 'Throwaway Testator', message: 'For the end-to-end test' });
    assert.throws(() => decryptMetadata(record.testatorData, fixture.keys.quantum.privateKey, { ...context, purpose: 'asset' }));
});

test('the saved file name never comes from untrusted path characters', () => {
    const id = '0xb91a12968ae49e1115b1d791797eaacda2fae469ff647138e319520050ea0fa8';
    assert.equal(safeFileName(id, 'pdf'), 'inheritance_b91a1296.pdf');
    assert.equal(safeFileName(id, '../../etc/passwd'), 'inheritance_b91a1296.bin');
    assert.equal(safeFileName(id, 'tar.gz'), 'inheritance_b91a1296.bin');
    assert.equal(safeFileName(id, undefined), 'inheritance_b91a1296.bin');
    assert.equal(safeFileName(id, 'JPEG'), 'inheritance_b91a1296.jpeg');
});
