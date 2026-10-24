/**
 * SPDX-License-Identifier: CC0-1.0
 *
 * The claim check for Inheritor contract v3, as in the iOS app (plan B2):
 *
 * 1. The V2.1.0 registry on Ethereum names the Inheritor contract for the record's chain. It must name the same,
 *    non-zero contract at the finalized and the latest block, or the claim waits as in maintenance.
 * 2. The record, the pause flag and the contract's version are read on the record's chain at one finalized and one
 *    latest block. On Ethereum the registry is read again in the same batch, so all of them share the two blocks.
 * 3. The version decides first: only major version 3 is decoded.
 * 4. The record must exist, belong to this beneficiary, be Claimable at both blocks and name the same parties and
 *    payload at both, on a contract that is unpaused at both.
 *
 * The deployment identity follows from the verified contract address; nothing comes from caches or a single provider.
 *
 * This work has been dedicated to the public domain under the CC0 1.0 Universal Public Domain Dedication.
 */

const { ethers } = require('ethers');
const { deploymentIdentity } = require('./shared-definitions');
const { ChainVerificationError } = require('./chain-reader');

const SUPPORTED_MAJOR_VERSION = 3;

const CHAIN_IDS = { ethereum: 1, arbitrum: 42161 };

const STATES = { DESIGNATED: 0, CLAIMABLE: 1, CLAIMED: 2, REVOKED: 3, PURGED: 4 };
const STATE_LABELS = ['Designated', 'Claimable', 'Claimed', 'Revoked', 'Purged'];

const registryInterface = new ethers.Interface([
    'function getContractAddress(uint256 chainId) view returns (address)'
]);

const inheritorInterface = new ethers.Interface([
    'function inheritances(bytes32 inheritanceId) view returns (address testatorEOA, address testatorSAA, address beneficiaryEOA, address beneficiarySAA, uint256 gracePeriod, uint8 state, bytes32 arweaveTransactionId, bytes32 payloadFingerprint, string testatorData)',
    'function contractPaused() view returns (bool)',
    'function getVersion() view returns (string)',
    'function getBeneficiaryInheritances(address beneficiaryEOA) view returns (bytes32[])'
]);

const DENIAL_MESSAGES = {
    maintenance: 'Inheritor is in maintenance for this network (the registry names no contract, or changed it between blocks). Please try again later.',
    update_required: 'This inheritance is on a newer Inheritor contract than this tool supports. Please download the latest recovery tools.',
    unsupported_version: 'The registry names an older Inheritor contract that this tool does not support. Please try again later.',
    record_not_found: 'No inheritance with this ID exists on this network.',
    contract_paused: 'The Inheritor contract is paused. Claims are not possible until it is resumed.',
    not_beneficiary: 'Your keys are not the beneficiary of this inheritance.',
    not_claimable: 'This inheritance is not claimable.',
    awaiting_finality: 'This inheritance is Claimable at the latest block but not yet at the finalized block. Try again in about 15–20 minutes.',
    record_changed: 'The inheritance names a different payload or different parties at the finalized and the latest block. Try again later.',
    fingerprint_mismatch: 'The payload downloaded from Arweave does not match the fingerprint stored on-chain. Nothing was decrypted.',
    context_expired: 'The verified claim check is too old. Please run the claim again.'
};

/** A claim the checks refuse. `code` is stable; the message says what the beneficiary can do. */
class ClaimDenial extends Error {
    constructor(code, details = {}) {
        super(details.message || DENIAL_MESSAGES[code] || code);
        this.code = code;
        Object.assign(this, details);
    }
}

/** The major version of "MAJOR", "MAJOR.MINOR" or "MAJOR.MINOR.PATCH" with 1–4 digit parts; null otherwise. */
function majorVersion(text) {
    return /^\d{1,4}(\.\d{1,4}){0,2}$/.test(text) ? Number(text.split('.')[0]) : null;
}

/** Throws unless a contract of this version may be used for claims and metadata. */
function requireSupportedVersion(text) {
    const major = majorVersion(text);
    if (major === SUPPORTED_MAJOR_VERSION) return;
    if (major === null || major > SUPPORTED_MAJOR_VERSION) throw new ClaimDenial('update_required', { version: text });
    throw new ClaimDenial('unsupported_version', { version: text });
}

const registryLookup = (registry, chainId) => ({
    to: registry,
    data: registryInterface.encodeFunctionData('getContractAddress', [chainId])
});
const contractCall = (contract, name, args = []) => ({
    to: contract,
    data: inheritorInterface.encodeFunctionData(name, args)
});

function decode(iface, name, data, what) {
    try {
        return iface.decodeFunctionResult(name, data);
    } catch {
        throw new ChainVerificationError('malformed_response', `malformed ${what}`);
    }
}

/** The contract the registry names at both blocks. A zero address or a change between the blocks is maintenance. */
function namedContract(reads, position) {
    const finalized = decode(registryInterface, 'getContractAddress', reads.finalized.results[position], 'registry entry')[0];
    const latest = decode(registryInterface, 'getContractAddress', reads.latest.results[position], 'registry entry')[0];
    if (finalized === ethers.ZeroAddress || finalized !== latest) throw new ClaimDenial('maintenance');
    return latest;
}

function decodeRecord(inheritanceId, data) {
    const r = decode(inheritorInterface, 'inheritances', data, 'inheritance record');
    const state = Number(r.state);
    if (!(state in STATE_LABELS)) throw new ChainVerificationError('malformed_response', 'unknown inheritance state');
    return {
        inheritanceId: inheritanceId.toLowerCase(),
        testatorEOA: r.testatorEOA,
        testatorSAA: r.testatorSAA,
        beneficiaryEOA: r.beneficiaryEOA,
        beneficiarySAA: r.beneficiarySAA,
        gracePeriod: r.gracePeriod,
        state,
        arweaveTransactionId: r.arweaveTransactionId.toLowerCase(),
        payloadFingerprint: r.payloadFingerprint.toLowerCase(),
        testatorData: r.testatorData
    };
}

const exists = (record) => record.testatorEOA !== ethers.ZeroAddress;

/** Same inheritance, parties and payload; state and the mutable fields may differ. */
function sameInheritance(a, b) {
    return a.inheritanceId === b.inheritanceId &&
        a.testatorEOA === b.testatorEOA &&
        a.beneficiaryEOA === b.beneficiaryEOA &&
        a.arweaveTransactionId === b.arweaveTransactionId &&
        a.payloadFingerprint === b.payloadFingerprint;
}

function chainIdFor(network) {
    const chainId = CHAIN_IDS[network];
    if (!chainId) throw new Error(`Unknown network: ${network}`);
    return chainId;
}

/**
 * Reads the registry at both Ethereum blocks, then `calls(contract)` on the record's chain at both blocks (with the
 * registry again on Ethereum). The version (the first of `calls`) is checked before anything else is decoded.
 */
async function verifiedReads({ registry, network, readers, calls }) {
    const chainId = chainIdFor(network);
    const lookup = registryLookup(registry, chainId);
    const named = await readers.ethereum.read([lookup]);
    const contract = namedContract(named, 0);
    const contractCalls = calls(contract);

    let reads;
    let first;
    if (network === 'ethereum') {
        reads = await readers.ethereum.read([lookup, ...contractCalls]);
        if (namedContract(reads, 0) !== contract) throw new ClaimDenial('maintenance');
        first = 1;
    } else {
        if (!readers[network]) throw new Error(`No ${network} providers configured`);
        reads = await readers[network].read(contractCalls);
        first = 0;
    }
    const versions = [reads.finalized, reads.latest].map((block) => {
        if (block.results.length !== first + contractCalls.length) {
            throw new ChainVerificationError('malformed_response', 'result count');
        }
        return decode(inheritorInterface, 'getVersion', block.results[first], 'contract version')[0];
    });
    versions.forEach(requireSupportedVersion);
    if (versions[0] !== versions[1]) {
        throw new ChainVerificationError('malformed_response', 'contract version differs between blocks');
    }

    return {
        chainId,
        contract,
        reads,
        first: first + 1,
        version: versions[1],
        startedAt: Math.min(named.startedAt, reads.startedAt)
    };
}

/**
 * The verified context a claim decides on.
 * @param {{environment: string, registry: string, network: 'ethereum'|'arbitrum', inheritanceId: string, readers: object}} options
 */
async function readClaimContext({ environment, registry, network, inheritanceId, readers }) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(inheritanceId)) throw new ClaimDenial('record_not_found');
    const verified = await verifiedReads({
        registry, network, readers,
        calls: (contract) => [
            contractCall(contract, 'getVersion'),
            contractCall(contract, 'inheritances', [inheritanceId]),
            contractCall(contract, 'contractPaused')
        ]
    });
    const snapshot = (block) => ({
        block: block.block,
        version: verified.version,
        record: decodeRecord(inheritanceId, block.results[verified.first]),
        paused: decode(inheritorInterface, 'contractPaused', block.results[verified.first + 1], 'pause flag')[0]
    });
    return {
        network,
        chainId: verified.chainId,
        contractAddress: verified.contract,
        deploymentIdentity: deploymentIdentity({ environment, chainId: verified.chainId, verifyingContract: verified.contract }),
        finalized: snapshot(verified.reads.finalized),
        latest: snapshot(verified.reads.latest),
        providers: verified.reads.providers,
        obtainedAt: verified.startedAt
    };
}

/**
 * The record-level checks. The record must be Claimable at both blocks: the latest block makes a check-in count
 * within seconds, the finalized block keeps a reorganisation from undoing the deadline.
 */
function checkRecord(context, beneficiaryEOA) {
    const { latest, finalized } = context;
    if (!exists(latest.record)) throw new ClaimDenial('record_not_found');
    if (finalized.paused || latest.paused) throw new ClaimDenial('contract_paused');
    if (latest.record.beneficiaryEOA.toLowerCase() !== beneficiaryEOA.toLowerCase()) {
        throw new ClaimDenial('not_beneficiary', { beneficiary: latest.record.beneficiaryEOA });
    }
    if (latest.record.state !== STATES.CLAIMABLE) {
        throw new ClaimDenial('not_claimable', {
            state: latest.record.state,
            message: `This inheritance is ${STATE_LABELS[latest.record.state]}, not Claimable.`
        });
    }
    if (!exists(finalized.record) || finalized.record.state !== STATES.CLAIMABLE) {
        throw new ClaimDenial('awaiting_finality', { state: finalized.record.state });
    }
    if (!sameInheritance(finalized.record, latest.record)) throw new ClaimDenial('record_changed');
}

/**
 * The inheritances of `beneficiary` on the verified contract, with their records at the latest block. Used for
 * listing and metadata: metadata is only decrypted from records read this way.
 */
async function readBeneficiaryRecords({ environment, registry, network, beneficiary, readers }) {
    const listing = await verifiedReads({
        registry, network, readers,
        calls: (contract) => [
            contractCall(contract, 'getVersion'),
            contractCall(contract, 'getBeneficiaryInheritances', [beneficiary])
        ]
    });
    const decodeIds = (block) => decode(inheritorInterface, 'getBeneficiaryInheritances', block.results[listing.first], 'inheritance list')[0]
        .map((id) => id.toLowerCase());
    // The latest list; IDs are append-only, so it contains every ID of the finalized list
    const ids = decodeIds(listing.reads.latest);

    const verified = await verifiedReads({
        registry, network, readers,
        calls: (contract) => {
            if (contract !== listing.contract) throw new ClaimDenial('maintenance');
            return [contractCall(contract, 'getVersion'), ...ids.map((id) => contractCall(contract, 'inheritances', [id]))];
        }
    });
    return {
        network,
        chainId: verified.chainId,
        contractAddress: verified.contract,
        version: verified.version,
        deploymentIdentity: deploymentIdentity({ environment, chainId: verified.chainId, verifyingContract: verified.contract }),
        records: ids.map((id, offset) => decodeRecord(id, verified.reads.latest.results[verified.first + offset]))
    };
}

module.exports = {
    SUPPORTED_MAJOR_VERSION,
    CHAIN_IDS,
    STATES,
    STATE_LABELS,
    ClaimDenial,
    majorVersion,
    readClaimContext,
    checkRecord,
    readBeneficiaryRecords,
    sameInheritance
};
