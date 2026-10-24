// SPDX-License-Identifier: CC0-1.0
// A JSON-RPC chain double for the claim check: blocks with per-block contract state, the registry and the v3
// Inheritor getters. Each provider is a view on a chain that can be made to lie, lag or fail.

const http = require('http');
const { ethers } = require('ethers');

const REGISTRY_ABI = ['function getContractAddress(uint256 chainId) view returns (address)'];
const INHERITOR_ABI = [
    'function inheritances(bytes32) view returns (address testatorEOA, address testatorSAA, address beneficiaryEOA, address beneficiarySAA, uint256 gracePeriod, uint8 state, bytes32 arweaveTransactionId, bytes32 payloadFingerprint, string testatorData)',
    'function contractPaused() view returns (bool)',
    'function getVersion() view returns (string)',
    'function getBeneficiaryInheritances(address) view returns (bytes32[])'
];
const registryInterface = new ethers.Interface(REGISTRY_ABI);
const inheritorInterface = new ethers.Interface(INHERITOR_ABI);

const ZERO = ethers.ZeroAddress;
const EMPTY_RECORD = {
    testatorEOA: ZERO, testatorSAA: ZERO, beneficiaryEOA: ZERO, beneficiarySAA: ZERO,
    gracePeriod: 0n, state: 0, arweaveTransactionId: ethers.ZeroHash, payloadFingerprint: ethers.ZeroHash, testatorData: ''
};

/** Contract state at one block: `{ registry: {address, entries: {chainId: address}}, inheritors: {address: {...}} }`. */
function answerCall(state, to, data) {
    const target = to.toLowerCase();
    if (state.registry && state.registry.address.toLowerCase() === target) {
        const parsed = registryInterface.parseTransaction({ data });
        const entry = state.registry.entries[String(parsed.args[0])] || ZERO;
        return registryInterface.encodeFunctionResult('getContractAddress', [entry]);
    }
    const inheritor = Object.entries(state.inheritors || {}).find(([address]) => address.toLowerCase() === target);
    if (!inheritor) return '0x';
    const contract = inheritor[1];
    const parsed = inheritorInterface.parseTransaction({ data });
    switch (parsed.name) {
        case 'inheritances': {
            const record = { ...EMPTY_RECORD, ...(contract.records[parsed.args[0].toLowerCase()] || {}) };
            return inheritorInterface.encodeFunctionResult('inheritances', [
                record.testatorEOA, record.testatorSAA, record.beneficiaryEOA, record.beneficiarySAA,
                record.gracePeriod, record.state, record.arweaveTransactionId, record.payloadFingerprint, record.testatorData
            ]);
        }
        case 'contractPaused':
            return inheritorInterface.encodeFunctionResult('contractPaused', [Boolean(contract.paused)]);
        case 'getVersion':
            if (contract.version === null) throw Object.assign(new Error('execution reverted'), { rpcCode: 3 });
            return inheritorInterface.encodeFunctionResult('getVersion', [contract.version ?? '3.0']);
        case 'getBeneficiaryInheritances': {
            const beneficiary = parsed.args[0].toLowerCase();
            const ids = Object.entries(contract.records)
                .filter(([, record]) => record.beneficiaryEOA.toLowerCase() === beneficiary)
                .map(([id]) => id);
            return inheritorInterface.encodeFunctionResult('getBeneficiaryInheritances', [ids]);
        }
        default:
            throw new Error(`unexpected call ${parsed.name}`);
    }
}

class MockChain {
    /**
     * @param {number} chainId
     * @param {object} options `{ now, finalized: {number, state}, latest: {number, state}, latestAge, finalizedAge }`
     */
    constructor(chainId, { now = Math.floor(Date.now() / 1000), finalized, latest, finalizedAge = 900, latestAge = 6 }) {
        this.chainId = chainId;
        this.blocks = new Map();
        this.addBlock(finalized.number, now - finalizedAge, finalized.state);
        this.addBlock(latest.number, now - latestAge, latest.state);
        this.heads = { finalized: finalized.number, latest: latest.number };
    }

    addBlock(number, timestamp, state) {
        const hash = ethers.keccak256(ethers.toUtf8Bytes(`block ${this.chainId} ${number}`));
        this.blocks.set(number, { number, hash, timestamp, state });
    }

    blockJson(block) {
        if (!block) return null;
        return { number: ethers.toQuantity(block.number), hash: block.hash, timestamp: ethers.toQuantity(block.timestamp), transactions: [] };
    }

    /** Answers one JSON-RPC request, as an honest provider would. */
    handle(method, params, view = {}) {
        const heads = { ...this.heads, ...(view.heads || {}) };
        switch (method) {
            case 'eth_chainId':
                return ethers.toQuantity(view.chainId ?? this.chainId);
            case 'eth_blockNumber':
                return ethers.toQuantity(heads.latest);
            case 'eth_getBlockByNumber': {
                const tag = params[0];
                // A tag is this provider's own head; a number is any block the chain has
                const number = tag === 'latest' || tag === 'finalized' ? heads[tag] : Number(BigInt(tag));
                return this.blockJson(this.blocks.get(number));
            }
            case 'eth_call': {
                const [{ to, data }, pin] = params;
                if (!pin || pin.requireCanonical !== true) throw new Error('eth_call must be pinned with requireCanonical');
                const block = [...this.blocks.values()].find((b) => b.hash === pin.blockHash);
                if (!block) throw Object.assign(new Error('header not found'), { rpcCode: -32000 });
                const state = view.state ? view.state(block) : block.state;
                return answerCall(state, to, data);
            }
            default:
                throw new Error(`unexpected method ${method}`);
        }
    }

    /**
     * A provider transport on this chain. `view` may override heads, chainId or state, `tamper(method, params, result)`
     * may rewrite answers, and `fail` makes every request fail like an unreachable host.
     */
    provider(operator, view = {}) {
        const chain = this;
        const requests = [];
        return {
            operator,
            requests,
            host: `${operator.toLowerCase().replace(/\W+/g, '-')}.test`,
            async post(body) {
                const request = JSON.parse(body);
                requests.push(request);
                if (view.fail) throw Object.assign(new Error('connection refused'), { unavailable: true });
                const reply = { jsonrpc: '2.0', id: request.id };
                try {
                    let result = chain.handle(request.method, request.params, view);
                    if (view.tamper) result = view.tamper(request.method, request.params, result);
                    reply.result = result;
                } catch (error) {
                    reply.error = { code: error.rpcCode ?? -32603, message: error.message };
                }
                return { status: 200, body: JSON.stringify(reply), date: 'date' in view ? view.date : new Date() };
            }
        };
    }
}

/** Serves a provider transport over HTTP on 127.0.0.1, for the end-to-end test. */
function serveProvider(provider) {
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
            try {
                // ethers batches requests into a JSON array
                const parsed = JSON.parse(body);
                const replies = await Promise.all((Array.isArray(parsed) ? parsed : [parsed])
                    .map(async (request) => JSON.parse((await provider.post(JSON.stringify(request))).body)));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(Array.isArray(parsed) ? replies : replies[0]));
            } catch {
                res.writeHead(502);
                res.end();
            }
        });
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
        server,
        url: `http://127.0.0.1:${server.address().port}/`
    })));
}

module.exports = { MockChain, serveProvider, REGISTRY_ABI, INHERITOR_ABI, EMPTY_RECORD };
