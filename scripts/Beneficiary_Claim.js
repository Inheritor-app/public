#!/usr/bin/env node

/**
 * Inheritance Claim Tool - Quantum-Safe Implementation
 *
 * This tool enables beneficiaries to claim digital inheritances using quantum-resistant cryptography
 * and a split-storage architecture for enhanced security.
 *
 * Architecture:
 * - Smart Contract: Stores inheritance metadata and Arweave transaction ID
 * - Arweave: Stores encrypted asset data and ML-KEM-768 encapsulated keys
 * - CloudFlare: Stores time-locked encrypted symmetric keys with signature authentication
 *
 * Cryptography:
 * - ML-KEM-768: NIST-standardized quantum-safe key encapsulation mechanism
 * - X-Wing: Hybrid classical/quantum-safe key agreement (ML-KEM-768 + X25519)
 * - AES-256-GCM: Authenticated encryption for asset data
 * - HKDF-SHA256: Key derivation for symmetric key wrapping
 *
 * Base64 Encoding Standards:
 * - IMPORTANT: Always use standard base64 encoding for all cryptographic operations
 * - Use toString('base64') and Buffer.from(..., 'base64') for crypto data
 * - Only use toString('base64url') for Arweave transaction IDs and data paths
 * - This ensures cross-platform compatibility with Swift implementations
 *
 * Usage: node Claim.js
 */

require('dotenv').config();
const { ethers } = require('ethers');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const secp256k1 = require('secp256k1');
const { keccak256 } = require('js-sha3');
const { ml_kem768 } = require('@noble/post-quantum/ml-kem.js');

// Import shared utilities (following refactored pattern)
const {
    NETWORK_CONSTANTS,
    NETWORK_CONFIGS,
    INHERITANCE_STATES,
    STATE_NAMES,
    CONTRACT_ABIS,
    formatters,
    networkUtils,
    errorHandlers,
    keyUtils
} = require('./utils/shared-utils');

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// =============================================================================
// Helper Functions
// =============================================================================

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

/**
 * HKDF (RFC 5869) key derivation function - UNCHANGED from old script
 * @param {Buffer} ikm Initial keying material (shared secret)
 * @param {Buffer} salt Salt value
 * @param {Buffer} info Context and application specific information
 * @param {number} length Length of the output key material in bytes
 * @returns {Buffer} Derived key
 */
function hkdf(ikm, salt, info, length) {
    // HKDF-Extract: Create the pseudorandom key (PRK) using HMAC-SHA256
    const prk = crypto.createHmac('sha256', salt).update(ikm).digest();

    // HKDF-Expand: Expand the PRK to the desired length
    const okm = Buffer.alloc(length);
    let t = Buffer.alloc(0);
    let offset = 0;

    for (let i = 1; i <= Math.ceil(length / 32); i++) {
        // T(i) = HMAC-SHA256(PRK, T(i-1) || info || i)
        const data = Buffer.concat([t, info, Buffer.from([i])]);
        t = crypto.createHmac('sha256', prk).update(data).digest();
        t.copy(okm, offset, 0, Math.min(32, length - offset));
        offset += 32;
    }

    return okm;
}


// =============================================================================
// CloudFlare Integration with Signature Authentication
// =============================================================================

/**
 * Generate app signature for CloudFlare authentication
 * @param {string} inheritanceId Inheritance ID (hex string)
 * @param {string} timestamp ISO timestamp
 * @param {string} privateKey Ethereum private key (hex with 0x prefix)
 * @returns {string} Hex signature
 */
function generateAppSignature(inheritanceId, timestamp, privateKey) {
    // Message format matches CloudFlareManager.swift: inheritanceId + timestamp
    const message = `${inheritanceId}${timestamp}`;

    // Ethereum personal message signing
    const messageBytes = Buffer.from(message, 'utf8');
    const prefix = `\x19Ethereum Signed Message:\n${messageBytes.length}`;
    const prefixBytes = Buffer.from(prefix, 'utf8');

    // Combine and hash with keccak256 (Ethereum standard)
    const fullMessage = Buffer.concat([prefixBytes, messageBytes]);
    const messageHash = Buffer.from(keccak256(fullMessage), 'hex');

    // Sign with secp256k1
    const privateKeyBuffer = Buffer.from(privateKey.replace('0x', ''), 'hex');
    const { signature, recid } = secp256k1.ecdsaSign(messageHash, privateKeyBuffer);

    // Add recovery id to signature (Ethereum format)
    const ethSignature = Buffer.concat([signature, Buffer.from([recid + 27])]);

    return ethSignature.toString('hex');
}

/**
 * Retrieve encrypted symmetric key from CloudFlare with signature authentication
 * @param {string} inheritanceId Inheritance ID
 * @param {string} network Network name ('ethereum' or 'arbitrum')
 * @param {string} beneficiaryEthPrivateKey Ethereum private key for signing
 * @returns {Promise<Buffer>} Encrypted symmetric key
 */
async function retrieveEncryptedSymmetricKey(inheritanceId, network, beneficiaryEthPrivateKey) {
    console.log('Retrieving encrypted symmetric key from CloudFlare...');

    try {
        const timestamp = new Date().toISOString();
        const signature = generateAppSignature(inheritanceId, timestamp, beneficiaryEthPrivateKey);

        // Use the root path for inheritance key retrieval (per worker code)
        const url = `${NETWORK_CONSTANTS.CLOUDFLARE_WORKER_URL}`;
        const params = {
            inheritanceId,
            network,
            appSignature: signature,
            timestamp
        };

        const response = await axios.get(url, { params });

        if (response.data.message === "Inheritance is not claimable") {
            throw new Error('Inheritance is not claimable yet');
        }

        if (!response.data.encryptedSymmetricKey) {
            throw new Error('No symmetric key returned from CloudFlare');
        }

        return fromB64(response.data.encryptedSymmetricKey);
    } catch (error) {
        if (error.response && error.response.status === 404) {
            throw new Error(`Encrypted symmetric key not found in CloudFlare.
                CloudFlare URL attempted: ${NETWORK_CONSTANTS.CLOUDFLARE_WORKER_URL}
                Network: ${network}
                Inheritance ID: ${inheritanceId}`);
        }

        throw errorHandlers.handleContractError(error, 'CloudFlare key retrieval');
    }
}

// =============================================================================
// Arweave Integration for JSON Format
// =============================================================================

/**
 * Retrieve and parse ArweaveEncryptedData from Arweave
 * @param {string} transactionId Arweave transaction ID (hex string)
 * @returns {Promise<Object>} Parsed ArweaveEncryptedData structure
 */
async function retrieveAssetFromArweave(transactionId) {
    console.log('Fetching encrypted asset from Arweave...');

    try {
        // Convert hex transaction ID to base64url for Arweave
        let txId = transactionId;
        if (transactionId.startsWith('0x')) {
            // Convert from hex to base64url
            const hexBytes = Buffer.from(transactionId.slice(2), 'hex');
            txId = hexBytes.toString('base64url');
        }

        const dataUrl = `https://arweave.net/${txId}`;

        // Fetch as JSON (ArweaveEncryptedData structure)
        const response = await axios.get(dataUrl);

        if (!response.data || typeof response.data !== 'object') {
            throw new Error('Invalid response format from Arweave');
        }

        const arweaveData = response.data;

        // Validate dual-recipient format (only format supported)
        if (!arweaveData.recipients || !Array.isArray(arweaveData.recipients)) {
            throw new Error('Invalid data format: expected dual-recipient format with recipients array');
        }

        console.log(`Retrieved DualRecipientEncryptedData (algorithm: ${arweaveData.algorithm})`);

        // Find the external (ML-KEM-768) recipient for Claim.js
        const externalRecipient = arweaveData.recipients.find(r => r.type === 'mlkem768');
        if (!externalRecipient) {
            throw new Error('No external (ML-KEM-768) recipient found in dual-recipient data');
        }

        // Validate required fields
        if (!arweaveData.ciphertext || !arweaveData.nonce || !arweaveData.tag) {
            throw new Error('Missing required fields in dual-recipient data');
        }

        // Validate envelope version
        if (arweaveData.version && arweaveData.version !== 1) {
            throw new Error(`Unsupported encryption version: ${arweaveData.version}`);
        }

        // Validate recipient version (recV)
        if (externalRecipient.recV && externalRecipient.recV !== 1) {
            throw new Error(`Unsupported recipient version: ${externalRecipient.recV}`);
        }

        return {
            encapsulatedKey: fromB64(externalRecipient.kem_ct),
            encryptedData: fromB64(arweaveData.ciphertext),
            nonce: fromB64(arweaveData.nonce),
            tag: fromB64(arweaveData.tag),
            fileType: arweaveData.fileType || 'bin',
            algorithm: arweaveData.algorithm || 'X-Wing/ML-KEM-768 + AES-256-GCM',
            version: arweaveData.version || 1, // Include version for AAD
            recipients: arweaveData.recipients || [], // Include recipients for count
            externalRecipient: {
                recV: externalRecipient.recV || 1, // Recipient version with fallback
                kid: externalRecipient.kid, // Include the actual kid for HKDF
                salt: fromB64(externalRecipient.salt),
                wrappedKey: fromB64(externalRecipient.wrappedK)
            }
        };
    } catch (error) {
        throw errorHandlers.handleContractError(error, 'Arweave retrieval');
    }
}

// =============================================================================
// Base64 helpers (standard Base64 only; no URL-safe here)
// =============================================================================

// Crypto uses standard Base64 with padding. Base64URL is reserved for Arweave IDs/paths only.
const b64 = (buf) => Buffer.from(buf).toString('base64');
const fromB64 = (s) => Buffer.from(s, 'base64');

// =============================================================================
// ML-KEM-768 Quantum-Safe Decryption
// =============================================================================

/**
 * Decrypt symmetric key for dual-recipient format using ML-KEM-768
 * @param {Buffer} wrappedKey Wrapped AES key from CloudFlare (external recipient)
 * @param {Buffer} encapsulatedKey ML-KEM-768 encapsulated key from Arweave
 * @param {Object} externalRecipient External recipient info (salt, wrapNonce)
 * @param {string} quantumPrivateKey Base64 encoded ML-KEM-768 private key
 * @returns {Buffer} Decrypted AES-256 symmetric key
 */
function decryptSymmetricKeyDualRecipient(wrappedKey, encapsulatedKey, externalRecipient, quantumPrivateKey) {
    console.log('Decrypting symmetric key with ML-KEM-768...');

    try {
        // 1. Import ML-KEM-768 private key from base64
        const privateKey = fromB64(quantumPrivateKey);

        // 2. Decapsulate using ML-KEM-768 to get shared secret
        const sharedSecret = ml_kem768.decapsulate(encapsulatedKey, privateKey);

        // 3. Derive encryption key using HKDF with external recipient's salt
        const info = Buffer.from(`wrap|v=1|kid=${externalRecipient.kid}|alg=AES-256-GCM`, 'utf8');
        const encryptionKey = hkdf(Buffer.from(sharedSecret), externalRecipient.salt, info, 32);

        // 4. Decrypt wrapped key using AES-GCM
        // Extract nonce from combined data (first 12 bytes)
        const nonce = wrappedKey.subarray(0, 12);
        const tag = Buffer.from(wrappedKey.subarray(-16));
        const ciphertext = Buffer.from(wrappedKey.subarray(12, -16));

        // Set up Additional Authenticated Data (AAD)
        // IMPORTANT: Use standard base64 (not URL-safe) for cross-platform compatibility
        const kemHash = require('crypto').createHash('sha256').update(encapsulatedKey).digest();
        const kemHashB64 = b64(kemHash);
        const wrapNonceB64 = b64(nonce);
        const aad = Buffer.from(`recV=${externalRecipient.recV}|kid=${externalRecipient.kid}|type=mlkem768|kem_hash=${kemHashB64}|nonce=${wrapNonceB64}`, 'utf8');

        const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, nonce);
        decipher.setAuthTag(tag);
        decipher.setAAD(aad);

        let decrypted = decipher.update(ciphertext);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        return decrypted;
    } catch (error) {
        throw new Error(`Symmetric key decryption failed: ${error.message}`);
    }
}


// =============================================================================
// Main Claim Workflow
// =============================================================================

/**
 * Claim an inheritance using quantum-safe cryptography
 *
 * Process:
 * 1. Verify inheritance is claimable on the blockchain
 * 2. Retrieve encrypted asset data from Arweave
 * 3. Retrieve time-locked symmetric key from CloudFlare (with signature verification)
 * 4. Decrypt symmetric key using ML-KEM-768 quantum-safe cryptography
 * 5. Decrypt asset using AES-256-GCM with dual-recipient authentication
 * 6. Save decrypted file to current directory
 *
 * @param {ethers.Contract} contract Inheritor smart contract instance
 * @param {string} inheritanceId Inheritance ID (hex string)
 * @param {string} networkName Network name ('ethereum' or 'arbitrum')
 * @param {Object} keys Key object containing ethereum and quantum private keys
 * @returns {Promise<string>} Path to the saved decrypted file
 */
async function claimInheritance(contract, inheritanceId, networkName, keys) {
    try {
        console.log('\n🚀 Starting inheritance claim process...');

        // 1. Check inheritance state (using optimized contract call)
        console.log('Verifying inheritance state...');
        const inheritance = await contract.inheritances(inheritanceId);

        // Convert state to number for comparison (ethers.js returns BigInt)
        const currentState = Number(inheritance.state);

        if (currentState !== INHERITANCE_STATES.CLAIMABLE) {
            const stateName = STATE_NAMES[currentState] || `Unknown (${currentState})`;
            console.log(`\n⚠️  Inheritance Status: ${stateName}`);

            if (currentState === INHERITANCE_STATES.DESIGNATED) {
                console.log(`📅 Scheduled transfer time: ${new Date(Number(inheritance.scheduledTransferTime) * 1000).toLocaleString()}`);
                const now = new Date();
                const transferTime = new Date(Number(inheritance.scheduledTransferTime) * 1000);

                if (transferTime > now) {
                    const timeUntil = Math.ceil((transferTime - now) / (1000 * 60 * 60 * 24));
                    console.log(`⏳ Time until claimable: ${timeUntil} day(s)`);
                } else {
                    console.log(`⏰ This inheritance should now be claimable. It may need to be triggered on the blockchain.`);
                }
            } else if (currentState === INHERITANCE_STATES.CLAIMED) {
                console.log(`✅ This inheritance has already been claimed.`);
            } else if (currentState === INHERITANCE_STATES.REVOKED) {
                console.log(`❌ This inheritance has been revoked by the testator.`);
            } else if (currentState === INHERITANCE_STATES.PURGED) {
                console.log(`🗑️  This inheritance has been purged from the system.`);
            }

            console.log(`\n💡 The inheritance must be in 'Claimable' state to be claimed.`);
            return null; // Return null instead of throwing error
        }

        console.log(`✅ Inheritance is claimable`);
        console.log(`   Testator: ${formatters.formatAddress(inheritance.testatorEOA)}`);
        console.log(`   Beneficiary: ${formatters.formatAddress(inheritance.beneficiaryEOA)}`);

        // 2. Get Arweave transaction ID
        const arweaveTransactionId = ethers.hexlify(inheritance.arweaveTransactionId);
        console.log(`Arweave transaction ID: ${arweaveTransactionId}`);

        // 3. Fetch from Arweave (now JSON format)
        const arweaveData = await retrieveAssetFromArweave(arweaveTransactionId);
        console.log(`Retrieved encrypted data: ${formatters.formatBytes(arweaveData.encryptedData.length)}`);

        // 4. Retrieve encrypted symmetric key from CloudFlare (with signature)
        const encryptedSymmetricKey = await retrieveEncryptedSymmetricKey(
            inheritanceId,
            networkName,
            keys.ethereum.privateKey
        );
        console.log(`Retrieved encrypted symmetric key: ${formatters.formatBytes(encryptedSymmetricKey.length)}`);

        // 5. Decrypt symmetric key using ML-KEM-768 (dual-recipient format)
        const symmetricKey = decryptSymmetricKeyDualRecipient(
            encryptedSymmetricKey,  // This is the wrapped key from CloudFlare (external recipient)
            arweaveData.encapsulatedKey,  // This is the ML-KEM-768 capsule from external recipient
            arweaveData.externalRecipient,  // Contains salt and wrap nonce
            keys.quantum.privateKey
        );

        // 5. Decrypt the asset using AES-256-GCM with dual-recipient AAD
        console.log('Decrypting asset data...');

        const version = arweaveData.version;
        const recipientCount = arweaveData.recipients.length;
        const payloadAAD = Buffer.from(`v=${version}|alg=AES-256-GCM|recipients=${recipientCount}`, 'utf8');

        const decipher = crypto.createDecipheriv('aes-256-gcm', symmetricKey, arweaveData.nonce);
        decipher.setAuthTag(arweaveData.tag);
        decipher.setAAD(payloadAAD);

        let decryptedAsset = decipher.update(arweaveData.encryptedData);
        decryptedAsset = Buffer.concat([decryptedAsset, decipher.final()]);
        console.log(`Decrypted asset size: ${formatters.formatBytes(decryptedAsset.length)}`);

        // 6. Save file with proper extension
        const filename = `inheritance_${inheritanceId.slice(2, 10)}.${arweaveData.fileType}`;
        const filepath = path.join(process.cwd(), filename);
        fs.writeFileSync(filepath, decryptedAsset);
        console.log(`\n✅ Asset saved successfully: ${filename}`);

        return filepath;
    } catch (error) {
        throw errorHandlers.handleContractError(error, 'claim inheritance');
    }
}

// =============================================================================
// Main Function
// =============================================================================

async function main() {
    console.log('==========================================');
    console.log('  Inheritor Claim Tool v2.0');
    console.log('  Quantum-Safe Implementation');
    console.log('==========================================\n');

    try {
        // 1. Load keys using shared utilities
        console.log('Loading beneficiary keys...');
        const ethereumKeys = keyUtils.loadBeneficiaryKeysFromFile();
        const quantumKeys = keyUtils.loadBeneficiaryQuantumKeys();

        const keys = {
            ethereum: ethereumKeys,
            quantum: quantumKeys
        };

        console.log(`Beneficiary address: ${ethereumKeys.address}`);

        // 2. Load gas wallet from .env (for consistency with other scripts)
        const gasPrivateKey = process.env.GAS_WALLET_PRIVATE_KEY;
        if (!gasPrivateKey) {
            console.log('⚠️  Note: GAS_WALLET_PRIVATE_KEY not found in .env file (not needed for claiming)');
        } else {
            const gasWallet = new ethers.Wallet(gasPrivateKey);
            console.log(`Gas wallet address: ${gasWallet.address}`);
        }

        // 3. Network selection
        console.log('\n📡 Select network:');
        console.log('1. Ethereum');
        console.log('2. Arbitrum');
        const networkChoice = await question('Your choice (1-2): ');

        const networkConfig = networkChoice === '1'
            ? NETWORK_CONFIGS.ethereum
            : NETWORK_CONFIGS.arbitrum;
        const networkName = networkChoice === '1' ? 'ethereum' : 'arbitrum';

        // 4. Set up provider using shared utilities
        const provider = await networkUtils.setupProvider(networkConfig, question);

        // 5. Get contract address using shared utilities
        const contractAddress = await networkUtils.getContractAddressForNetwork(
            provider,
            networkConfig,
            question
        );

        // 6. Create contract instance with shared ABI
        const contract = new ethers.Contract(
            contractAddress,
            CONTRACT_ABIS.INHERITOR_ABI,
            provider
        );

        console.log(`\n✅ Connected to Inheritor contract: ${contractAddress}`);

        // 7. Get inheritance ID
        const inheritanceId = await question('\n🔑 Enter the inheritance ID to claim (0x...): ');

        if (!inheritanceId.startsWith('0x') || inheritanceId.length !== 66) {
            throw new Error('Invalid inheritance ID format (expected 0x followed by 64 hex characters)');
        }

        // 8. Execute claim
        const savedPath = await claimInheritance(contract, inheritanceId, networkName, keys);

        if (savedPath) {
            console.log('\n🎉 Inheritance claimed successfully!');
            console.log(`📁 File saved to: ${savedPath}`);
        } else {
            console.log('\n🔄 You can try again when the inheritance becomes claimable.');
        }

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        if (error.stack && process.env.DEBUG) {
            console.error('Stack trace:', error.stack);
        }
    } finally {
        rl.close();
    }
}

// =============================================================================
// Module Exports & Execution
// =============================================================================

// Test base64 symmetry on startup (simple verification)
function testB64Symmetry() {
    const testData = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD]);
    const roundTrip = fromB64(b64(testData));
    if (!testData.equals(roundTrip)) {
        throw new Error('Base64 symmetry test failed');
    }
    console.log('✅ Base64 symmetry test passed');
}

// Run if executed directly
if (require.main === module) {
    testB64Symmetry();
    main();
}

// Export functions for testing
module.exports = {
    claimInheritance,
    decryptSymmetricKeyDualRecipient,
    retrieveAssetFromArweave,
    retrieveEncryptedSymmetricKey,
    generateAppSignature,
    hkdf,
    b64,
    fromB64,
    testB64Symmetry
};