// SPDX-License-Identifier: CC0-1.0
// Two-provider reads (plan B3), with the rules the app and the worker use.

const test = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');

const { TwoProviderReader, ChainVerificationError } = require('../scripts/utils/chain-reader');
const { MockChain } = require('./support/mock-chain');

const REGISTRY = '0xe33AB05Eef0d1803ca564C9a1DFaC6797853D3d2';
const CONTRACT = '0xFD8Ac60986E793A869f22373d79118a16dfB4992';
const registry = new ethers.Interface(['function getContractAddress(uint256) view returns (address)']);
const lookup = { to: REGISTRY, data: registry.encodeFunctionData('getContractAddress', [1]) };

const fastPolicy = { headAttempts: 3, retryDelayMs: 1 };
const state = (contract) => ({ registry: { address: REGISTRY, entries: { 1: contract } }, inheritors: {} });

function chain(options = {}) {
    return new MockChain(1, {
        finalized: { number: 100, state: state(CONTRACT) },
        latest: { number: 160, state: state(CONTRACT) },
        ...options
    });
}

const reader = (providers, policy = {}) => new TwoProviderReader({ chainId: 1, providers, policy: { ...fastPolicy, ...policy } });
const named = (hex) => registry.decodeFunctionResult('getContractAddress', hex)[0];

test('two agreeing providers yield the finalized and latest reads, every call pinned to the block hash', async () => {
    const c = chain();
    const a = c.provider('Operator A');
    const b = c.provider('Operator B');
    const reads = await reader([a, b]).read([lookup]);
    assert.equal(reads.finalized.block.number, 100);
    assert.equal(reads.latest.block.number, 160);
    assert.equal(named(reads.finalized.results[0]), CONTRACT);
    assert.equal(named(reads.latest.results[0]), CONTRACT);
    for (const provider of [a, b]) {
        const calls = provider.requests.filter((r) => r.method === 'eth_call');
        assert.equal(calls.length, 2);
        for (const call of calls) assert.equal(call.params[1].requireCanonical, true);
        assert.deepEqual(calls.map((call) => call.params[1].blockHash).sort(), [c.blocks.get(100).hash, c.blocks.get(160).hash].sort());
    }
});

test('the latest read uses the higher head and asks the lagging provider for it by number', async () => {
    const c = chain();
    const lagging = c.provider('Operator A', { heads: { latest: 150 } });
    c.addBlock(150, c.blocks.get(160).timestamp - 2, state(CONTRACT));
    const reads = await reader([lagging, c.provider('Operator B')]).read([lookup]);
    assert.equal(reads.latest.block.number, 160);
    assert.ok(lagging.requests.some((r) => r.method === 'eth_getBlockByNumber' && r.params[0] === ethers.toQuantity(160)));
});

test('a provider that cannot reach the higher head is replaced by the next operator', async () => {
    const c = chain();
    const stuck = { heads: { latest: 150 } };
    c.addBlock(150, c.blocks.get(160).timestamp - 2, state(CONTRACT));
    // The lagging provider answers block 160 with null: it does not have it.
    const lagging = c.provider('Operator A', { ...stuck, tamper: (method, params, result) => (method === 'eth_getBlockByNumber' && params[0] === ethers.toQuantity(160) ? null : result) });
    const reads = await reader([lagging, c.provider('Operator B'), c.provider('Operator C')]).read([lookup]);
    assert.equal(reads.latest.block.number, 160);
    assert.deepEqual(reads.providers, ['Operator B', 'Operator C']);
});

test('finalized heads must converge; otherwise the read fails closed', async () => {
    const c = chain();
    c.addBlock(101, c.blocks.get(100).timestamp + 12, state(CONTRACT));
    await assert.rejects(
        reader([c.provider('Operator A'), c.provider('Operator B', { heads: { finalized: 101 } })]).read([lookup]),
        (error) => error instanceof ChainVerificationError && error.code === 'providers_disagree'
    );
});

test('providers that disagree on a block or a call result fail closed', async () => {
    const c = chain();
    const forgedHash = c.provider('Operator B', {
        tamper: (method, params, result) => (method === 'eth_getBlockByNumber' && params[0] === 'latest' ? { ...result, hash: ethers.ZeroHash.replace(/0$/, '1') } : result)
    });
    await assert.rejects(reader([c.provider('Operator A'), forgedHash]).read([lookup]), (error) => error.code === 'providers_disagree');

    const lying = c.provider('Operator B', { state: () => state('0x175e78803B4f8FCB6396c79ec22504F5792C09C2') });
    await assert.rejects(reader([c.provider('Operator A'), lying]).read([lookup]), (error) => error.code === 'providers_disagree');
});

test('two providers of the same operator do not count as two', async () => {
    const c = chain();
    await assert.rejects(
        reader([c.provider('Operator A'), c.provider('Operator A')]).read([lookup]),
        (error) => error.code === 'not_enough_providers'
    );
});

test('a provider on the wrong chain or that does not answer is skipped', async () => {
    const c = chain();
    const reads = await reader([
        c.provider('Wrong chain', { chainId: 42161 }),
        c.provider('Down', { fail: true }),
        c.provider('Operator A'),
        c.provider('Operator B')
    ]).read([lookup]);
    assert.deepEqual(reads.providers, ['Operator A', 'Operator B']);
});

test('block ages are judged against the providers\' agreed HTTP time', async () => {
    const stale = chain({ latestAge: 300 });
    await assert.rejects(reader([stale.provider('A'), stale.provider('B')]).read([lookup]), (error) => error.code === 'stale_block');

    const staleFinal = chain({ finalizedAge: 3 * 3600 });
    await assert.rejects(reader([staleFinal.provider('A'), staleFinal.provider('B')]).read([lookup]), (error) => error.code === 'stale_block');

    const c = chain();
    const skewed = c.provider('B', { date: new Date(Date.now() + 120_000) });
    await assert.rejects(reader([c.provider('A'), skewed]).read([lookup]), (error) => error.code === 'no_agreed_time');
    await assert.rejects(reader([c.provider('A'), c.provider('B', { date: null })]).read([lookup]), (error) => error.code === 'no_agreed_time');
});

test('a reverted call on both providers fails closed', async () => {
    const c = chain();
    const inheritor = new ethers.Interface(['function getVersion() view returns (string)']);
    c.blocks.forEach((block) => { block.state.inheritors = { [CONTRACT]: { records: {}, version: null } }; });
    await assert.rejects(
        reader([c.provider('A'), c.provider('B')]).read([{ to: CONTRACT, data: inheritor.encodeFunctionData('getVersion') }]),
        (error) => error.code === 'reverted'
    );
});
