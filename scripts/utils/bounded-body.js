/**
 * SPDX-License-Identifier: CC0-1.0
 *
 * Reads an HTTP response body with a byte limit, cancelling the stream as soon as the limit is passed, so an
 * untrusted server cannot exhaust memory before its answer is rejected.
 *
 * This work has been dedicated to the public domain under the CC0 1.0 Universal Public Domain Dedication.
 */

class BodyTooLarge extends Error {
    constructor(maxBytes) {
        super(`response larger than ${maxBytes} bytes`);
    }
}

/**
 * @param {Response} response
 * @param {number} maxBytes
 * @param {Function} [onChunk] Called after every chunk, for idle timeouts
 * @returns {Promise<Buffer>}
 */
async function readBodyBounded(response, maxBytes, onChunk = () => {}) {
    const declared = Number(response.headers.get('content-length'));
    if (declared > maxBytes) {
        await discardBody(response);
        throw new BodyTooLarge(maxBytes);
    }
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        onChunk();
        size += value.length;
        if (size > maxBytes) {
            // Not awaited: a stream that never settles its cancellation must not hang the caller
            reader.cancel().catch(() => {});
            throw new BodyTooLarge(maxBytes);
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks);
}

/** Cancels a body that will not be read. */
async function discardBody(response) {
    if (response.body) response.body.cancel().catch(() => {});
}

module.exports = { BodyTooLarge, readBodyBounded, discardBody };
