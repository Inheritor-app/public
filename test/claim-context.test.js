// SPDX-License-Identifier: CC0-1.0
// The claim check (plan B2): registry, version, pause flag and record at the finalized and the latest block.

const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');

const { readClaimContext, checkRecord, readBeneficiaryRecords, ClaimDenial } = require('../scripts/utils/claim-context');
const { TwoProviderReader } = require('../scripts/utils/chain-reader');
const { deploymentIdentity } = require('../scripts/utils/shared-definitions');
const { MockChain } = require('./support/mock-chain');

const REGISTRY = '0xe33AB05Eef0d1803ca564C9a1DFaC6797853D3d2';
const CONTRACT = '0xFD8Ac60986E793A869f22373d79118a16dfB4992';
const OTHER_CONTRACT = '0x175e78803B4f8FCB6396c79ec22504F5792C09C2';
const ID = '0xb91a12968ae49e1115b1d791797eaacda2fae469ff647138e319520050ea0fa8';
const TESTATOR = '0x728a26D8FdF162196EC8Bb3A715B0463AcF03B52';
const BENEFICIARY = '0xb4eED66a4564231767dfdeCC96c6496A113570d9';
const FINGERPRINT = '0xe9cf7e7be7b953b7a1bfdcda843f24f8d9f107de0d01f1137699d58ff4592303';
const ARWEAVE_ID = '0x5ce28424318b4a12ab392009c77415d6240839f233bbadc6e955fe359171426e';

const record = (overrides = {}) => ({
    testatorEOA: TESTATOR,
    testatorSAA: '0x1111111111111111111111111111111111111111',
    beneficiaryEOA: BENEFICIARY,
    beneficiarySAA: '0x2222222222222222222222222222222222222222',
    gracePeriod: 86400n,
    state: 1,
    arweaveTransactionId: ARWEAVE_ID,
    payloadFingerprint: FINGERPRINT,
    testatorData: '0x',
    ...overrides
});

/** One block's state on a chain: the registry (on Ethereum) and the Inheritor contract. */
function blockState({ chainId = 1, named = CONTRACT, arbitrumNamed = CONTRACT, rec = record(), paused = false, version = '3.0', onChain = chainId }) {
    const state = { inheritors: { [CONTRACT]: { records: { [ID]: rec }, paused, version } } };
    if (onChain === 1) state.registry = { address: REGISTRY, entries: { 1: named, 42161: arbitrumNamed } };
    return state;
}

function setup({ finalized = {}, latest = {}, arbitrum = null } = {}) {
    const ethereum = new MockChain(1, {
        finalized: { number: 100, state: blockState({ ...finalized }) },
        latest: { number: 160, state: blockState({ ...latest }) }
    });
    const readers = {
        ethereum: new TwoProviderReader({ chainId: 1, providers: [ethereum.provider('A'), ethereum.provider('B')], policy: { retryDelayMs: 1 } })
    };
    if (arbitrum) {
        const chain = new MockChain(42161, {
            finalized: { number: 9000, state: blockState({ onChain: 42161, ...arbitrum.finalized }) },
            latest: { number: 9400, state: blockState({ onChain: 42161, ...arbitrum.latest }) }
        });
        readers.arbitrum = new TwoProviderReader({ chainId: 42161, providers: [chain.provider('A'), chain.provider('B')], policy: { retryDelayMs: 1 } });
    }
    return readers;
}

const read = (readers, network = 'ethereum') =>
    readClaimContext({ environment: 'production', registry: REGISTRY, network, inheritanceId: ID, readers });

const denied = (code) => (error) => error instanceof ClaimDenial && error.code === code;

test('a record Claimable at both blocks on an unpaused v3 contract passes, with the deployment identity of that contract', async () => {
    const context = await read(setup());
    assert.equal(context.contractAddress, CONTRACT);
    assert.equal(context.chainId, 1);
    assert.equal(context.deploymentIdentity, deploymentIdentity({ environment: 'production', chainId: 1, verifyingContract: CONTRACT }));
    assert.equal(context.latest.record.payloadFingerprint, FINGERPRINT);
    assert.equal(context.latest.record.arweaveTransactionId, ARWEAVE_ID);
    assert.equal(context.latest.version, '3.0');
    checkRecord(context, BENEFICIARY.toLowerCase());
});

test('an Arbitrum record is read on Arbitrum from the contract the Ethereum registry names', async () => {
    const readers = setup({ arbitrum: { finalized: {}, latest: {} } });
    const context = await read(readers, 'arbitrum');
    assert.equal(context.chainId, 42161);
    assert.equal(context.deploymentIdentity, deploymentIdentity({ environment: 'production', chainId: 42161, verifyingContract: CONTRACT }));
    checkRecord(context, BENEFICIARY);
});

test('a zero or changing registry entry is maintenance', async () => {
    await assert.rejects(read(setup({ finalized: { named: ethers.ZeroAddress }, latest: { named: ethers.ZeroAddress } })), denied('maintenance'));
    await assert.rejects(read(setup({ latest: { named: OTHER_CONTRACT } })), denied('maintenance'));
});

test('any major version other than 3 is refused before the record is decoded', async () => {
    await assert.rejects(read(setup({ finalized: { version: '4.0' }, latest: { version: '4.0' } })), denied('update_required'));
    await assert.rejects(read(setup({ latest: { version: '4.1' } })), denied('update_required'));
    await assert.rejects(read(setup({ finalized: { version: 'v3' }, latest: { version: 'v3' } })), denied('update_required'));
    await assert.rejects(read(setup({ finalized: { version: '2.1' }, latest: { version: '2.1' } })), denied('unsupported_version'));
    await read(setup({ finalized: { version: '3.1.2' }, latest: { version: '3.1.2' } }));
    await assert.rejects(read(setup({ latest: { version: null } })), (error) => error.code === 'reverted');
});

test('the record must be Claimable at both blocks, unpaused, unchanged and this beneficiary\'s', async () => {
    const check = async (options, code) => {
        const context = await read(setup(options));
        assert.throws(() => checkRecord(context, BENEFICIARY), denied(code), code);
    };
    await check({ latest: { paused: true } }, 'contract_paused');
    await check({ finalized: { paused: true } }, 'contract_paused');
    await check({ latest: { rec: record({ state: 0 }) } }, 'not_claimable');
    await check({ latest: { rec: record({ state: 2 }) } }, 'not_claimable');
    await check({ finalized: { rec: record({ state: 0 }) } }, 'awaiting_finality');
    await check({ finalized: { rec: record({ payloadFingerprint: '0x' + '11'.repeat(32) }) } }, 'record_changed');
    await check({ finalized: { rec: record({ arweaveTransactionId: '0x' + '22'.repeat(32) }) } }, 'record_changed');
    await check({ latest: { rec: record({ beneficiaryEOA: TESTATOR }) }, finalized: { rec: record({ beneficiaryEOA: TESTATOR }) } }, 'not_beneficiary');
    await check({ latest: { rec: record({ testatorEOA: ethers.ZeroAddress }) } }, 'record_not_found');
});

test('beneficiary records are listed from the verified contract with its version', async () => {
    const listing = await readBeneficiaryRecords({
        environment: 'production', registry: REGISTRY, network: 'ethereum', beneficiary: BENEFICIARY, readers: setup()
    });
    assert.equal(listing.contractAddress, CONTRACT);
    assert.equal(listing.deploymentIdentity, deploymentIdentity({ environment: 'production', chainId: 1, verifyingContract: CONTRACT }));
    assert.deepEqual(listing.records.map((r) => r.inheritanceId), [ID]);
    assert.equal(listing.records[0].state, 1);

    await assert.rejects(readBeneficiaryRecords({
        environment: 'production', registry: REGISTRY, network: 'ethereum', beneficiary: BENEFICIARY,
        readers: setup({ finalized: { version: '4.0' }, latest: { version: '4.0' } })
    }), denied('update_required'));
});
