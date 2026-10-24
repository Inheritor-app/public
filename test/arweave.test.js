// SPDX-License-Identifier: CC0-1.0
// Arweave downloads: only a payload matching the on-chain fingerprint is accepted, and a gateway can neither
// exhaust memory nor stall the claim.

const test = require('node:test');
const assert = require('node:assert/strict');

const { downloadVerifiedPayload } = require('../scripts/utils/arweave');
const { buildClaimFixture } = require('./support/claim-fixture');

const fixture = buildClaimFixture();
const good = 'https://good.test';
const target = (gateway) => gateway + fixture.arweavePath;

function streamResponse(chunks, { stallAfter = false } = {}) {
    return (url, init) => new Response(new ReadableStream({
        async pull(controller) {
            if (chunks.length) return controller.enqueue(new TextEncoder().encode(chunks.shift()));
            if (!stallAfter) return controller.close();
            // Never ends, until the request is aborted
            await new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
        }
    }), { status: 200 });
}

function router(routes) {
    return async (url, init) => {
        const route = routes[url];
        if (!route) return new Response('not found', { status: 404 });
        return route(url, init);
    };
}

const options = (fetch, extra = {}) => ({
    arweaveTransactionId: fixture.arweaveId,
    expectedFingerprint: fixture.record.payloadFingerprint,
    fetch,
    ...extra
});

test('the payload that matches the fingerprint is returned', async () => {
    const result = await downloadVerifiedPayload(options(router({ [target(good)]: streamResponse([fixture.arweaveJson]) }), { gateways: [good] }));
    assert.equal(result.json, fixture.arweaveJson);
});

test('an oversized response is cut off and the next gateway is used', async () => {
    const huge = 'https://huge.test';
    let delivered = 0;
    const endless = () => new Response(new ReadableStream({
        pull(controller) {
            delivered += 1024;
            controller.enqueue(new Uint8Array(1024));
        }
    }), { status: 200 });
    const result = await downloadVerifiedPayload(options(
        router({ [target(huge)]: endless, [target(good)]: streamResponse([fixture.arweaveJson]) }),
        { gateways: [huge, good], maxBytes: 64 * 1024 }
    ));
    assert.equal(result.json, fixture.arweaveJson);
    assert.ok(delivered < 256 * 1024, `read ${delivered} bytes`);
});

test('a stalled response is aborted and the next gateway is used', async () => {
    const stalled = 'https://stalled.test';
    const started = Date.now();
    const result = await downloadVerifiedPayload(options(
        router({ [target(stalled)]: streamResponse(['{"version":'], { stallAfter: true }), [target(good)]: streamResponse([fixture.arweaveJson]) }),
        { gateways: [stalled, good], idleTimeoutMs: 100 }
    ));
    assert.equal(result.json, fixture.arweaveJson);
    assert.ok(Date.now() - started < 5000);
});

test('when no gateway serves the registered payload nothing is accepted', async () => {
    const other = JSON.parse(fixture.arweaveJson);
    other.nonce = Buffer.alloc(12, 9).toString('base64');
    await assert.rejects(
        downloadVerifiedPayload(options(router({ [target(good)]: streamResponse([JSON.stringify(other)]) }), { gateways: [good] })),
        (error) => error.code === 'fingerprint_mismatch'
    );
    await assert.rejects(downloadVerifiedPayload(options(router({}), { gateways: [good] })), /No Arweave gateway/);
});
