#!/usr/bin/env node

/**
 * Inheritor Claim Tool v2.0 - Quantum-Safe Implementation
 *
 * This script allows beneficiaries to claim their inheritances using the new quantum-safe
 * split storage architecture:
 * 1. Retrieving the Arweave transaction ID from the smart contract
 * 2. Fetching the ArweaveEncryptedData (JSON format) from Arweave
 * 3. Fetching the encrypted symmetric key from CloudFlare (with signature authentication)
 * 4. Decrypting the symmetric key using ML-KEM-768 quantum-safe cryptography
 * 5. Decrypting the asset using AES-256-GCM
 * 6. Saving the decrypted file to the current directory
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
    GAS_CONSTANTS,
    CONTRACT_ABIS,
    formatters,
    contractUtils,
    networkUtils,
    errorHandlers,
    keyUtils,
    walletUtils
} = require('./utils/shared-utils');

// =============================================================================
// Constants
// =============================================================================

const CLOUDFLARE_WORKER_URL = 'https://keyprovider-test.inheritor.workers.dev';

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

/**
 * Decrypt asset using AES-GCM - UNCHANGED from old script
 * @param {Buffer} encryptedData Encrypted data (nonce + ciphertext + tag)
 * @param {Buffer} symmetricKey AES-256 key
 * @returns {Buffer} Decrypted asset data
 */
function decryptAsset(encryptedData, symmetricKey) {
    console.log('Decrypting asset...');

    if (!encryptedData || !symmetricKey) {
        throw new Error('Missing required parameters');
    }

    // Validate minimum length (nonce=12, data>=1, tag=16)
    if (encryptedData.length < 12 + 1 + 16) {
        throw new Error('Encrypted data too short');
    }

    // Extract components: nonce (12 bytes) + ciphertext + tag (16 bytes)
    const nonce = Buffer.from(Uint8Array.prototype.slice.call(encryptedData, 0, 12));
    const tag = Buffer.from(Uint8Array.prototype.slice.call(encryptedData, encryptedData.length - 16));
    const ciphertext = Buffer.from(Uint8Array.prototype.slice.call(encryptedData, 12, encryptedData.length - 16));

    // Decrypt using AES-GCM
    const decipher = crypto.createDecipheriv('aes-256-gcm', symmetricKey, nonce);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted;
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
        const url = `${CLOUDFLARE_WORKER_URL}`;
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

        return Buffer.from(response.data.encryptedSymmetricKey, 'base64');
    } catch (error) {
        if (error.response && error.response.status === 404) {
            throw new Error(`Encrypted symmetric key not found in CloudFlare. This could mean:
1. The inheritance was created before CloudFlare integration
2. The symmetric key was never stored in CloudFlare
3. The CloudFlare worker endpoint has changed
4. The inheritance ID or network parameter is incorrect

CloudFlare URL attempted: ${CLOUDFLARE_WORKER_URL}
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

        return {
            encapsulatedKey: Buffer.from(externalRecipient.kem_ct, 'base64'),
            encryptedData: Buffer.from(arweaveData.ciphertext, 'base64'),
            nonce: Buffer.from(arweaveData.nonce, 'base64'),
            tag: Buffer.from(arweaveData.tag, 'base64'),
            fileType: arweaveData.fileType || 'bin',
            algorithm: arweaveData.algorithm || 'AES-256-GCM',
            externalRecipient: {
                kid: externalRecipient.kid, // Include the actual kid for HKDF
                salt: Buffer.from(externalRecipient.salt, 'base64'),
                wrapNonce: Buffer.from(externalRecipient.wrap_nonce, 'base64'),
                wrappedKey: Buffer.from(externalRecipient.wrappedK, 'base64')
            }
        };
    } catch (error) {
        throw errorHandlers.handleContractError(error, 'Arweave retrieval');
    }
}

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
    console.log('Decrypting symmetric key with ML-KEM-768 (dual-recipient)...');

    try {
        // Debug logging
        console.log('Debug: Input sizes:');
        console.log(`  wrappedKey: ${wrappedKey.length} bytes`);
        console.log(`  encapsulatedKey: ${encapsulatedKey.length} bytes`);
        console.log(`  privateKey: ${Buffer.from(quantumPrivateKey, 'base64').length} bytes`);
        console.log(`  salt: ${externalRecipient.salt.length} bytes`);
        console.log(`  wrapNonce: ${externalRecipient.wrapNonce.length} bytes`);
        console.log(`  kid: ${externalRecipient.kid}`);
        console.log(`Debug: wrappedKey hex: ${wrappedKey.toString('hex').substring(0, 120)}...`);

        // 1. Import ML-KEM-768 private key from base64
        const privateKey = Buffer.from(quantumPrivateKey, 'base64');

        // 2. Decapsulate using ML-KEM-768
        const sharedSecret = ml_kem768.decapsulate(encapsulatedKey, privateKey);
        console.log(`Debug: sharedSecret: ${sharedSecret.length} bytes`);

        // 3. Derive encryption key using HKDF with external recipient's salt
        // Use the actual kid from the external recipient to match Swift format
        const infoString = `wrap|v=1|kid=${externalRecipient.kid}|alg=AES-256-GCM`;
        const info = Buffer.from(infoString, 'utf8');
        const encryptionKey = hkdf(Buffer.from(sharedSecret), externalRecipient.salt, info, 32);
        console.log(`Debug: HKDF info: "${infoString}"`);
        console.log(`Debug: encryptionKey: ${encryptionKey.length} bytes`);

        // 4. Decrypt wrapped key using AES-GCM
        // Try two possible formats for the wrapped key from CloudFlare

        // Add AAD (Additional Authenticated Data) as used in Swift
        const aadString = `v=1|kid=${externalRecipient.kid}|type=mlkem768|purpose=wrap`;
        const aad = Buffer.from(aadString, 'utf8');
        console.log(`Debug: AAD: "${aadString}"`);
        console.log(`Debug: wrapNonce hex: ${externalRecipient.wrapNonce.toString('hex')}`);

        let decrypted;

        // Format 1: ciphertext + tag (current assumption)
        try {
            console.log('Debug: Trying format 1 - ciphertext + tag');
            const tag = wrappedKey.slice(-16);
            const ciphertext = wrappedKey.slice(0, -16);
            console.log(`Debug: tag: ${tag.length} bytes, ciphertext: ${ciphertext.length} bytes`);

            const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, externalRecipient.wrapNonce);
            decipher.setAuthTag(tag);
            decipher.setAAD(aad);

            decrypted = decipher.update(ciphertext);
            decrypted = Buffer.concat([decrypted, decipher.final()]);

            console.log('Debug: Format 1 succeeded');
        } catch (error1) {
            console.log(`Debug: Format 1 failed: ${error1.message}`);

            // Format 2: nonce + ciphertext + tag
            try {
                console.log('Debug: Trying format 2 - nonce + ciphertext + tag');
                if (wrappedKey.length >= 28) { // 12 + 32 + 16 minimum
                    const nonce = wrappedKey.slice(0, 12);
                    const tag = wrappedKey.slice(-16);
                    const ciphertext = wrappedKey.slice(12, -16);
                    console.log(`Debug: nonce: ${nonce.length} bytes, ciphertext: ${ciphertext.length} bytes, tag: ${tag.length} bytes`);

                    const decipher2 = crypto.createDecipheriv('aes-256-gcm', encryptionKey, nonce);
                    decipher2.setAuthTag(tag);
                    decipher2.setAAD(aad);

                    decrypted = decipher2.update(ciphertext);
                    decrypted = Buffer.concat([decrypted, decipher2.final()]);

                    console.log('Debug: Format 2 succeeded');
                } else {
                    throw new Error('Wrapped key too short for format 2');
                }
            } catch (error2) {
                console.log(`Debug: Format 2 failed: ${error2.message}`);
                throw new Error(`Both formats failed - Format 1: ${error1.message}, Format 2: ${error2.message}`);
            }
        }

        console.log('Symmetric key decrypted successfully (dual-recipient)');
        console.log(`Debug: decrypted symmetric key: ${decrypted.length} bytes`);
        return decrypted;
    } catch (error) {
        console.log(`Debug: Decryption error details: ${error.message}`);
        throw new Error(`Dual-recipient symmetric key decryption failed: ${error.message}`);
    }
}


// =============================================================================
// Main Claim Workflow
// =============================================================================

/**
 * Main claim function with all optimizations
 * @param {ethers.Contract} contract Inheritor contract instance
 * @param {string} inheritanceId Inheritance ID to claim
 * @param {string} networkName Network name ('ethereum' or 'arbitrum')
 * @param {Object} keys Combined key object with ethereum and quantum keys
 * @returns {Promise<string>} Path to saved file
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

        // 6. Debug asset data structure
        console.log('Debug: Asset data components:');
        console.log(`  nonce: ${arweaveData.nonce.length} bytes`);
        console.log(`  encryptedData: ${arweaveData.encryptedData.length} bytes`);
        console.log(`  tag: ${arweaveData.tag.length} bytes`);
        console.log(`  symmetricKey: ${symmetricKey.length} bytes`);

        // 7. Try different asset decryption approaches
        console.log('Decrypting asset data...');

        let decryptedAsset;

        // Try approach 1: Reconstruct encrypted data (current approach)
        try {
            console.log('Debug: Trying approach 1 - reconstruct nonce+data+tag');
            const encryptedAssetData = Buffer.concat([
                arweaveData.nonce,
                arweaveData.encryptedData,
                arweaveData.tag
            ]);
            decryptedAsset = decryptAsset(encryptedAssetData, symmetricKey);
            console.log('Debug: Approach 1 succeeded');
        } catch (error1) {
            console.log(`Debug: Approach 1 failed: ${error1.message}`);

            // Try approach 2: Direct AES-GCM with separate components (no AAD)
            try {
                console.log('Debug: Trying approach 2 - direct AES-GCM with separate components (no AAD)');
                const decipher = crypto.createDecipheriv('aes-256-gcm', symmetricKey, arweaveData.nonce);
                decipher.setAuthTag(arweaveData.tag);

                decryptedAsset = decipher.update(arweaveData.encryptedData);
                decryptedAsset = Buffer.concat([decryptedAsset, decipher.final()]);

                console.log('Debug: Approach 2 succeeded');
            } catch (error2) {
                console.log(`Debug: Approach 2 failed: ${error2.message}`);

                // Try approach 3: Direct AES-GCM with AAD for dual-recipient
                try {
                    console.log('Debug: Trying approach 3 - direct AES-GCM with dual-recipient AAD');
                    const payloadAAD = Buffer.from('v=1|alg=AES-256-GCM|recipients=2', 'utf8');

                    const decipher3 = crypto.createDecipheriv('aes-256-gcm', symmetricKey, arweaveData.nonce);
                    decipher3.setAuthTag(arweaveData.tag);
                    decipher3.setAAD(payloadAAD);

                    decryptedAsset = decipher3.update(arweaveData.encryptedData);
                    decryptedAsset = Buffer.concat([decryptedAsset, decipher3.final()]);

                    console.log('Debug: Approach 3 succeeded');
                } catch (error3) {
                    console.log(`Debug: Approach 3 failed: ${error3.message}`);
                    throw new Error(`All asset decryption approaches failed - Approach 1: ${error1.message}, Approach 2: ${error2.message}, Approach 3: ${error3.message}`);
                }
            }
        }
        console.log(`Decrypted asset size: ${formatters.formatBytes(decryptedAsset.length)}`);

        // 8. Save file with proper extension
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

// Run if executed directly
if (require.main === module) {
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
    decryptAsset
};