// SPDX-License-Identifier: CC0-1.0
// A complete claimable inheritance for the end-to-end tests: throwaway keys, a sealed envelope v2, the on-chain
// record, two-provider chains, and doubles of the key provider and an Arweave gateway.

const crypto = require('crypto');
const { ethers } = require('ethers');
const { ml_kem768 } = require('@noble/post-quantum/ml-kem.js');

const { sealEnvelope, forArweave } = require('./seal-envelope');
const { MockChain } = require('./mock-chain');
const { payloadFingerprint, deploymentIdentity } = require('../../scripts/utils/shared-definitions');
const { releaseDigest, KEY_PROVIDER_DOMAIN } = require('../../scripts/utils/key-release');

const REGISTRY = '0xe33AB05Eef0d1803ca564C9a1DFaC6797853D3d2';
const CONTRACT = '0xFD8Ac60986E793A869f22373d79118a16dfB4992';

function buildClaimFixture({ plaintext = Buffer.from('the last will, throwaway test data'), fileType = 'pdf' } = {}) {
    const beneficiary = ethers.Wallet.createRandom();
    const testator = ethers.Wallet.createRandom();
    const mlkem = ml_kem768.keygen(crypto.randomBytes(64));
    const inheritanceId = ethers.hexlify(crypto.randomBytes(32));
    const identity = deploymentIdentity({ environment: 'production', chainId: 1, verifyingContract: CONTRACT });

    const context = { deploymentIdentity: identity, inheritanceId, testator: testator.address, beneficiary: beneficiary.address };
    const random = (n) => crypto.randomBytes(n);
    const randomness = () => ({
        contentKey: random(32), payloadNonce: random(12), encapsulationSeed: random(32),
        salt: random(32), wrapNonce: random(12), xwingPlaceholder: random(48)
    });
    const asset = sealEnvelope({ plaintext, context: { ...context, purpose: 'asset' }, mlkemPublicKey: mlkem.publicKey, randomness: randomness(), fileType });
    const metadata = sealEnvelope({
        plaintext: Buffer.from(JSON.stringify({ name: 'Throwaway Testator', message: 'For the end-to-end test' })),
        context: { ...context, purpose: 'metadata' },
        mlkemPublicKey: mlkem.publicKey,
        randomness: randomness(),
        fileType: 'json'
    });
    const arweaveJson = JSON.stringify(forArweave(asset.envelope));
    const arweaveId = ethers.hexlify(crypto.randomBytes(32));

    const record = {
        testatorEOA: testator.address,
        testatorSAA: ethers.Wallet.createRandom().address,
        beneficiaryEOA: beneficiary.address,
        beneficiarySAA: ethers.Wallet.createRandom().address,
        gracePeriod: 86400n,
        state: 1,
        arweaveTransactionId: arweaveId,
        payloadFingerprint: payloadFingerprint(arweaveJson),
        // A string in the contract: the app stores the envelope JSON as hex text without a 0x prefix
        testatorData: Buffer.from(JSON.stringify(metadata.envelope)).toString('hex')
    };

    const blockState = (overrides = {}) => ({
        registry: { address: REGISTRY, entries: { 1: CONTRACT } },
        inheritors: { [CONTRACT]: { records: { [inheritanceId.toLowerCase()]: { ...record, ...overrides.record } }, paused: Boolean(overrides.paused), version: overrides.version ?? '3.0' } }
    });

    function chain({ finalized = {}, latest = {} } = {}) {
        return new MockChain(1, {
            finalized: { number: 1000, state: blockState(finalized) },
            latest: { number: 1080, state: blockState(latest) }
        });
    }

    /** A key provider double that enforces the v2 release rules it can check without a chain. */
    function worker({ refuse } = {}) {
        const requests = [];
        async function handle(body) {
            requests.push(body);
            if (refuse) return { status: refuse.status, body: refuse.body };
            const expectedKeys = ['beneficiary', 'chainId', 'deploymentIdentity', 'inheritanceId', 'payloadFingerprint', 'requestVersion', 'signature', 'timestamp'];
            if (JSON.stringify(Object.keys(body).sort()) !== JSON.stringify(expectedKeys)) return { status: 400, body: { error: 'unknown_field' } };
            if (body.requestVersion !== 2 || body.chainId !== 1) return { status: 400, body: { error: 'bad_request' } };
            if (Math.abs(body.timestamp - Math.floor(Date.now() / 1000)) > 300) return { status: 401, body: { error: 'invalid_signature' } };
            const signer = ethers.recoverAddress(releaseDigest(body), body.signature);
            if (signer !== beneficiary.address || body.beneficiary !== beneficiary.address) return { status: 403, body: { error: 'signer_not_beneficiary' } };
            if (body.deploymentIdentity !== identity || body.inheritanceId !== inheritanceId) return { status: 404, body: { error: 'key_not_found' } };
            if (body.payloadFingerprint !== record.payloadFingerprint) return { status: 409, body: { error: 'fingerprint_mismatch' } };
            return {
                status: 200,
                body: { encryptedSymmetricKey: asset.wrappedK.toString('base64'), deploymentIdentity: identity, inheritanceId, verifiedAt: {} }
            };
        }
        return { requests, handle };
    }

    const arweavePath = '/' + Buffer.from(arweaveId.slice(2), 'hex').toString('base64url');

    /** A fetch double routing the key provider and Arweave gateways. */
    function fetchDouble({ workerDouble, gateways = { 'https://arweave.test': arweaveJson } }) {
        return async (url, init = {}) => {
            const text = (status, body, headers = {}) => new Response(body, { status, headers });
            if (url === 'https://worker.test/v2/release') {
                const reply = await workerDouble.handle(JSON.parse(init.body));
                return text(reply.status, JSON.stringify(reply.body));
            }
            for (const [gateway, payload] of Object.entries(gateways)) {
                if (url === gateway + arweavePath) return text(200, payload);
            }
            return text(404, 'not found');
        };
    }

    return {
        beneficiary, testator, mlkem, inheritanceId, identity, record, arweaveJson, arweaveId, arweavePath, plaintext, fileType,
        chain, worker, fetchDouble,
        keys: {
            ethereum: { address: beneficiary.address, privateKey: beneficiary.privateKey },
            quantum: { privateKey: Buffer.from(mlkem.secretKey).toString('base64'), publicKey: Buffer.from(mlkem.publicKey).toString('base64') }
        },
        config: { environment: 'production', registry: REGISTRY, keyProviderUrl: 'https://worker.test', arweaveGateways: ['https://arweave.test'] },
        KEY_PROVIDER_DOMAIN
    };
}

module.exports = { buildClaimFixture, REGISTRY, CONTRACT };
