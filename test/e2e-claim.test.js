// SPDX-License-Identifier: CC0-1.0
// End to end: runs the beneficiary scripts as a beneficiary would, against local doubles of two RPC providers, the
// key provider and an Arweave gateway, all served over HTTP on 127.0.0.1.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');

const { buildClaimFixture } = require('./support/claim-fixture');
const { serveProvider } = require('./support/mock-chain');
const { serve, runScript, workspaceWithKeys } = require('./support/run-script');

async function services(t, fixture, chain = fixture.chain()) {
    const providerA = await serveProvider(chain.provider('Operator A'));
    const providerB = await serveProvider(chain.provider('Operator B'));
    const workerDouble = fixture.worker();
    const worker = await serve(async (req, body) => {
        if (req.method !== 'POST' || req.url !== '/v2/release') return { status: 404, body: '{}' };
        const reply = await workerDouble.handle(JSON.parse(body));
        return { status: reply.status, body: JSON.stringify(reply.body) };
    });
    const arweave = await serve(async (req) => (req.url === fixture.arweavePath
        ? { status: 200, body: fixture.arweaveJson }
        : { status: 404, body: 'not found' }));
    t.after(() => [providerA, providerB, worker, arweave].forEach(({ server }) => server.close()));
    return {
        workerDouble,
        providerA,
        env: {
            INHERITOR_ENVIRONMENT: 'production',
            INHERITOR_ETHEREUM_RPCS: `Operator A=${providerA.url},Operator B=${providerB.url}`,
            INHERITOR_KEY_PROVIDER_URL: worker.url,
            INHERITOR_ARWEAVE_GATEWAYS: arweave.url
        }
    };
}

test('Beneficiary_Claim.js claims a v3 inheritance with envelope v2 end to end', async (t) => {
    const fixture = buildClaimFixture({ fileType: 'pdf' });
    const { env, workerDouble } = await services(t, fixture);
    const { dir, keysDir } = workspaceWithKeys(t, fixture);

    const { code, output } = await runScript('Beneficiary_Claim.js', {
        cwd: dir,
        env: { ...env, INHERITOR_KEYS_DIR: keysDir, GAS_WALLET_PRIVATE_KEY: '' },
        answers: [
            { prompt: 'Your choice (1-2): ', answer: '1' },
            { prompt: 'Enter the inheritance ID', answer: fixture.inheritanceId }
        ]
    });

    assert.equal(code, 0, output);
    const saved = path.join(dir, `inheritance_${fixture.inheritanceId.slice(2, 10)}.pdf`);
    assert.ok(fs.existsSync(saved), output);
    assert.deepEqual(fs.readFileSync(saved), fixture.plaintext);
    assert.match(output, /Claimable at the finalized and the latest block/);
    assert.match(output, /Payload matches the on-chain fingerprint/);
    assert.equal(workerDouble.requests.length, 1);
    assert.doesNotMatch(output, new RegExp(fixture.keys.ethereum.privateKey.slice(2)));

    // A second run never overwrites the claimed file
    const again = await runScript('Beneficiary_Claim.js', {
        cwd: dir,
        env: { ...env, INHERITOR_KEYS_DIR: keysDir, GAS_WALLET_PRIVATE_KEY: '' },
        answers: [
            { prompt: 'Your choice (1-2): ', answer: '1' },
            { prompt: 'Enter the inheritance ID', answer: fixture.inheritanceId }
        ]
    });
    assert.equal(again.code, 1);
    assert.match(again.output, /already exists/);
    assert.deepEqual(fs.readFileSync(saved), fixture.plaintext);
});

test('Beneficiary_Claim.js stops with a clear message on a newer contract version', async (t) => {
    const fixture = buildClaimFixture();
    const { env, workerDouble } = await services(t, fixture, fixture.chain({ finalized: { version: '4.0' }, latest: { version: '4.0' } }));
    const { dir, keysDir } = workspaceWithKeys(t, fixture);

    const { code, output } = await runScript('Beneficiary_Claim.js', {
        cwd: dir,
        env: { ...env, INHERITOR_KEYS_DIR: keysDir },
        answers: [
            { prompt: 'Your choice (1-2): ', answer: '1' },
            { prompt: 'Enter the inheritance ID', answer: fixture.inheritanceId }
        ]
    });
    assert.equal(code, 1);
    assert.match(output, /newer Inheritor contract than this tool supports/);
    assert.equal(workerDouble.requests.length, 0);
    assert.deepEqual(fs.readdirSync(dir), ['keys']);
});

test('Beneficiary_CheckClaimable.js lists verified inheritances with decrypted metadata and checks claimability', async (t) => {
    const fixture = buildClaimFixture();
    const { env, providerA } = await services(t, fixture);
    const { dir, keysDir } = workspaceWithKeys(t, fixture);

    const { output } = await runScript('Beneficiary_CheckClaimable.js', {
        cwd: dir,
        env: { ...env, INHERITOR_KEYS_DIR: keysDir, GAS_WALLET_PRIVATE_KEY: ethers.Wallet.createRandom().privateKey },
        answers: [
            { prompt: 'Your choice (1-2): ', answer: '1' },
            { prompt: 'Your choice (1-2): ', answer: '1' },
            { prompt: 'Enter RPC URL for Ethereum Mainnet: ', answer: providerA.url },
            { prompt: 'Choose an action (1-5): ', answer: '1' },
            { prompt: 'Press Enter to return to the main menu...', answer: '' },
            { prompt: 'Choose an action (1-5): ', answer: '2' },
            { prompt: 'Enter the Inheritance ID', answer: fixture.inheritanceId },
            { prompt: 'Choose an action (1-5): ', answer: '5' }
        ]
    });

    assert.match(output, new RegExp(`Inheritance ID: ${fixture.inheritanceId}`));
    assert.match(output, /Testator: Throwaway Testator/);
    assert.match(output, /Message: "For the end-to-end test"/);
    assert.match(output, /version 3\.0/);
    assert.match(output, /CLAIMABLE at the finalized and the latest block/);
    assert.match(output, /Exiting/);
});
