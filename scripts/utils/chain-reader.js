/**
 * SPDX-License-Identifier: CC0-1.0
 *
 * Verified chain reads from two independent JSON-RPC providers, with the rules of the Inheritor app and key provider:
 *
 * - finalized: both providers must report the same finalized head. They are asked again while their heads
 *   converge; neither head may be chosen by one provider alone.
 * - latest: the higher of the two heads, so a lagging provider cannot hide a newer check-in, pause or revocation.
 *   The lagging provider is asked for that block by number.
 * - Both must agree on each block's number, hash and timestamp. Every eth_call is pinned to the block hash with
 *   requireCanonical (EIP-1898) and must return identical bytes on both.
 * - Block ages are judged against the providers' agreed HTTP Date, not the local clock.
 *
 * Any disagreement fails closed. A provider that does not answer is replaced by the next operator.
 *
 * This work has been dedicated to the public domain under the CC0 1.0 Universal Public Domain Dedication.
 */

const { performance } = require('perf_hooks');

const DEFAULT_POLICY = {
    maxLatestBlockAgeSec: 60,
    // Finality lags the head by about 13–19 minutes on Ethereum and about 17 on Arbitrum
    maxFinalizedBlockAgeSec: 45 * 60,
    maxBlockAheadSec: 5 * 60,
    maxClockDisagreementSec: 30,
    headAttempts: 4,
    retryDelayMs: 2000,
    requiredProviders: 2,
    timeoutMs: 15000,
    maxResponseBytes: 1 << 20
};

class ChainVerificationError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

/** A provider that failed to answer; the read is tried again without it. */
class ProviderFailure extends Error {
    constructor(index, reason) {
        super(reason);
        this.index = index;
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A JSON-RPC quantity: "0x" and 1–16 hex digits. */
function quantity(text) {
    if (typeof text !== 'string' || !/^0x[0-9a-fA-F]{1,16}$/.test(text)) return null;
    return Number(BigInt(text));
}

function parseBlock(result) {
    if (result === null || result === undefined) return null;
    const number = quantity(result.number);
    const timestamp = quantity(result.timestamp);
    if (number === null || timestamp === null || typeof result.hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(result.hash)) {
        throw new ChainVerificationError('malformed_response', 'malformed block');
    }
    return { number, hash: result.hash.toLowerCase(), timestamp };
}

const sameBlock = (a, b) => a.number === b.number && a.hash === b.hash && a.timestamp === b.timestamp;

/**
 * JSON-RPC over HTTPS (http only for loopback hosts, for local nodes and tests). Errors name the host only, so an
 * API key in a provider URL is never printed.
 */
function httpTransport({ operator, url, fetch = globalThis.fetch, timeoutMs = DEFAULT_POLICY.timeoutMs, maxResponseBytes = DEFAULT_POLICY.maxResponseBytes }) {
    const parsed = new URL(url);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)) {
        throw new Error(`RPC provider ${parsed.hostname} must use https`);
    }
    return {
        operator,
        host: parsed.host,
        async post(body) {
            let response;
            let text;
            try {
                response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body,
                    redirect: 'error',
                    signal: AbortSignal.timeout(timeoutMs)
                });
                text = await response.text();
            } catch (error) {
                throw Object.assign(new Error(`${parsed.host}: no response`), { unavailable: true });
            }
            if (response.status !== 200) {
                throw Object.assign(new Error(`${parsed.host}: HTTP ${response.status}`), { unavailable: true });
            }
            if (text.length > maxResponseBytes) {
                throw new ChainVerificationError('malformed_response', `${parsed.host}: response too large`);
            }
            const date = response.headers.get('date');
            const parsedDate = date ? new Date(date) : null;
            return { status: response.status, body: text, date: parsedDate && !isNaN(parsedDate) ? parsedDate : null };
        }
    };
}

class TwoProviderReader {
    /**
     * @param {{chainId: number, providers: Array<{operator: string, post: Function}>, policy?: object}} options
     */
    constructor({ chainId, providers, policy = {} }) {
        this.chainId = chainId;
        this.providers = providers;
        this.policy = { ...DEFAULT_POLICY, ...policy };
        this.requestId = 0;
    }

    /**
     * Reads `calls` at one finalized and one latest block, agreed by two providers of different operators.
     * @param {Array<{to: string, data: string}>} calls
     * @returns {Promise<{finalized: {block, results: string[]}, latest: {block, results: string[]}, providers: string[], startedAt: number}>}
     */
    async read(calls) {
        const excluded = new Set();
        for (;;) {
            const pair = await this.selectProviders(excluded);
            try {
                return await this.readFrom(calls, pair);
            } catch (error) {
                if (!(error instanceof ProviderFailure)) throw error;
                excluded.add(error.index);
            }
        }
    }

    /** The first providers, by distinct operator, that answer for this chain. */
    async selectProviders(excluded) {
        const chosen = [];
        const operators = new Set();
        for (let index = 0; index < this.providers.length; index++) {
            if (excluded.has(index) || operators.has(this.providers[index].operator)) continue;
            try {
                const reply = await this.rpc(index, 'eth_chainId', []);
                if (quantity(reply.result) !== this.chainId) {
                    excluded.add(index);
                    continue;
                }
                chosen.push(index);
                operators.add(this.providers[index].operator);
                if (chosen.length === this.policy.requiredProviders) return chosen;
            } catch (error) {
                if (!(error instanceof ProviderFailure)) throw error;
                excluded.add(index);
            }
        }
        throw new ChainVerificationError(
            'not_enough_providers',
            `chain ${this.chainId}: ${chosen.length} of ${this.policy.requiredProviders} independent providers answered`
        );
    }

    async readFrom(calls, [a, b]) {
        const startedAt = performance.now();
        const finalized = await this.agreedFinalized(a, b);
        const { block: latest, now } = await this.agreedLatest(a, b);
        if (latest.number < finalized.number) {
            throw new ChainVerificationError('malformed_response', 'latest block is older than the finalized block');
        }
        this.checkAge(finalized, now, this.policy.maxFinalizedBlockAgeSec, 'finalized');
        this.checkAge(latest, now, this.policy.maxLatestBlockAgeSec, 'latest');

        const [finalizedResults, latestResults] = await Promise.all([
            this.agreedCalls(calls, finalized, a, b),
            this.agreedCalls(calls, latest, a, b)
        ]);
        return {
            finalized: { block: finalized, results: finalizedResults },
            latest: { block: latest, results: latestResults },
            providers: [this.providers[a].operator, this.providers[b].operator],
            startedAt
        };
    }

    async agreedFinalized(a, b) {
        for (let attempt = 1; attempt <= this.policy.headAttempts; attempt++) {
            const [blockA, blockB] = await Promise.all([this.block(a, 'finalized'), this.block(b, 'finalized')]);
            if (blockA.block.number === blockB.block.number) {
                if (!sameBlock(blockA.block, blockB.block)) {
                    throw new ChainVerificationError('providers_disagree', 'providers disagree on the finalized block');
                }
                return blockA.block;
            }
            if (attempt < this.policy.headAttempts) await sleep(this.policy.retryDelayMs);
        }
        throw new ChainVerificationError('providers_disagree', 'providers report different finalized heads');
    }

    /** The higher head, confirmed by both providers, and the providers' agreed time. */
    async agreedLatest(a, b) {
        const [headA, headB] = await Promise.all([this.block(a, 'latest'), this.block(b, 'latest')]);
        const now = this.agreedTime(headA.date, headB.date);
        if (headA.block.number === headB.block.number) {
            if (!sameBlock(headA.block, headB.block)) {
                throw new ChainVerificationError('providers_disagree', 'providers disagree on the latest block');
            }
            return { block: headA.block, now };
        }
        const [lagging, head] = headA.block.number > headB.block.number ? [b, headA.block] : [a, headB.block];
        for (let attempt = 1; attempt <= this.policy.headAttempts; attempt++) {
            const confirmed = parseBlock((await this.rpc(lagging, 'eth_getBlockByNumber', ['0x' + head.number.toString(16), false])).result);
            if (confirmed) {
                if (!sameBlock(confirmed, head)) {
                    throw new ChainVerificationError('providers_disagree', 'providers disagree on the latest block');
                }
                return { block: head, now };
            }
            if (attempt < this.policy.headAttempts) await sleep(this.policy.retryDelayMs);
        }
        throw new ProviderFailure(lagging, 'provider lags the latest head');
    }

    agreedTime(first, second) {
        if (!first || !second || Math.abs(first - second) > this.policy.maxClockDisagreementSec * 1000) {
            throw new ChainVerificationError('no_agreed_time', 'the providers do not agree on the current time (HTTP Date)');
        }
        return Math.max(first.getTime(), second.getTime()) / 1000;
    }

    checkAge(block, now, limit, tag) {
        const age = now - block.timestamp;
        if (age < -this.policy.maxBlockAheadSec) {
            throw new ChainVerificationError('stale_block', `${tag} block is dated ahead of network time`);
        }
        if (age > limit) {
            throw new ChainVerificationError('stale_block', `${tag} block is ${Math.round(age)} s old (limit ${limit} s)`);
        }
    }

    async block(index, tag) {
        const reply = await this.rpc(index, 'eth_getBlockByNumber', [tag, false]);
        const block = parseBlock(reply.result);
        if (!block) throw new ProviderFailure(index, `no ${tag} block`);
        return { block, date: reply.date };
    }

    async agreedCalls(calls, block, a, b) {
        return Promise.all(calls.map(async (call) => {
            const [outcomeA, outcomeB] = await Promise.all([this.call(a, call, block), this.call(b, call, block)]);
            if (outcomeA.reverted !== outcomeB.reverted || outcomeA.data !== outcomeB.data) {
                throw new ChainVerificationError('providers_disagree', `providers disagree on a call to ${call.to}`);
            }
            if (outcomeA.reverted) {
                throw new ChainVerificationError('reverted', `call to ${call.to} reverted`);
            }
            return outcomeA.data;
        }));
    }

    async call(index, call, block) {
        try {
            const reply = await this.rpc(index, 'eth_call', [{ to: call.to, data: call.data }, { blockHash: block.hash, requireCanonical: true }]);
            if (typeof reply.result !== 'string' || !/^0x([0-9a-fA-F]{2})*$/.test(reply.result)) {
                throw new ChainVerificationError('malformed_response', 'malformed eth_call result');
            }
            return { reverted: false, data: reply.result.toLowerCase() };
        } catch (error) {
            if (error.rpcError) {
                // Code 3 is the standard execution-reverted error; older nodes only say so in the message
                if (error.rpcError.code === 3 || /revert/i.test(error.rpcError.message || '')) return { reverted: true, data: null };
                throw new ProviderFailure(index, `eth_call: ${error.rpcError.code}`);
            }
            throw error;
        }
    }

    /**
     * One request. Transport failures become a ProviderFailure; a JSON-RPC error on eth_call is passed on for the
     * caller to classify, and a ProviderFailure otherwise; anything unparseable fails closed.
     */
    async rpc(index, method, params) {
        const provider = this.providers[index];
        const id = ++this.requestId;
        let response;
        try {
            response = await provider.post(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
        } catch (error) {
            if (error instanceof ChainVerificationError) throw error;
            throw new ProviderFailure(index, error.message);
        }
        let reply;
        try {
            reply = JSON.parse(response.body);
        } catch {
            throw new ChainVerificationError('malformed_response', `${method} from ${provider.operator}: not JSON`);
        }
        if (reply === null || typeof reply !== 'object' || reply.id !== id) {
            throw new ChainVerificationError('malformed_response', `${method} from ${provider.operator}`);
        }
        if (reply.error) {
            const rpcError = { code: reply.error.code, message: reply.error.message };
            if (method === 'eth_call') throw Object.assign(new Error(`eth_call: ${rpcError.code}`), { rpcError });
            throw new ProviderFailure(index, `${method}: ${rpcError.code}`);
        }
        if (!Object.prototype.hasOwnProperty.call(reply, 'result')) {
            throw new ChainVerificationError('malformed_response', `${method} from ${provider.operator}`);
        }
        return { result: reply.result, date: response.date };
    }
}

/**
 * Parses a provider list: comma-separated `Operator name=https://url` entries, or bare URLs (the operator is then
 * the URL's host). Two entries of the same operator count as one provider.
 */
function parseProviderList(text) {
    return text.split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
        const separator = entry.indexOf('=');
        const hasName = separator > 0 && !entry.slice(0, separator).includes('://');
        const url = hasName ? entry.slice(separator + 1).trim() : entry;
        const operator = hasName ? entry.slice(0, separator).trim() : new URL(url).hostname;
        return { operator, url };
    });
}

module.exports = {
    DEFAULT_POLICY,
    TwoProviderReader,
    ChainVerificationError,
    httpTransport,
    parseProviderList
};
