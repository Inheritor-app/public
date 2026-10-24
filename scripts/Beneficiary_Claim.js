#!/usr/bin/env node

/**
 * SPDX-License-Identifier: CC0-1.0
 *
 * Inheritance Claim Tool - Inheritor contract v3, envelope v2
 *
 * This work has been dedicated to the public domain under the CC0 1.0 Universal Public Domain Dedication.
 * To the extent possible under law, the author(s) have waived all copyright and related or neighboring
 * rights to this work. This work is published from: Netherlands.
 *
 * For more information, see: https://creativecommons.org/publicdomain/zero/1.0/
 *
 * This tool lets a beneficiary claim a digital inheritance without the iOS app.
 *
 * Architecture:
 * - Smart Contract (v3): stores the inheritance record, its Arweave transaction ID and the payload fingerprint
 * - Arweave: stores the encrypted asset (envelope v2)
 * - Key provider: releases the beneficiary's wrapped key once the record is Claimable at both the finalized and the
 *   latest block, on a signed EIP-712 release request
 *
 * Verification (nothing is decrypted unless every step passes):
 * 1. Two independent RPC providers must agree on the registry, the contract version, the pause flag and the record,
 *    at one finalized and one latest block. The record must be Claimable at both.
 * 2. The payload downloaded from Arweave must match the record's on-chain payload fingerprint.
 * 3. After the key is released the record is verified again.
 * 4. The asset only decrypts under the envelope v2 context of this exact record: deployment, inheritance,
 *    testator, beneficiary and purpose.
 *
 * Cryptography:
 * - ML-KEM-768: NIST-standardized quantum-safe key encapsulation mechanism
 * - AES-256-GCM: Authenticated encryption for asset data and key wrapping
 * - HKDF-SHA256: Key derivation for symmetric key wrapping
 *
 * Configuration: see scripts/utils/claim-config.js (INHERITOR_ENVIRONMENT, INHERITOR_ETHEREUM_RPCS, ...).
 *
 * Usage: node scripts/Beneficiary_Claim.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { keyUtils, formatters } = require('./utils/shared-utils');
const { loadClaimConfig, buildReaders, describeProviders } = require('./utils/claim-config');
const { claimInheritance, safeFileName } = require('./utils/claim-flow');

let rl;

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

/** Prints why a claim stopped, with what the beneficiary can do about it. */
function reportFailure(error) {
    console.error(`\n❌ ${error.message}`);
    if (error.code === 'rate_limited' && error.retryAfter) {
        console.error(`   Try again in ${error.retryAfter} seconds.`);
    }
    if (error.code && process.env.DEBUG) {
        console.error(`   (code: ${error.code})`);
    }
    if (error.stack && process.env.DEBUG) {
        console.error('Stack trace:', error.stack);
    }
}

async function main() {
    console.log('==========================================');
    console.log('  Inheritor Claim Tool v3.0');
    console.log('  Contract v3 · Envelope v2');
    console.log('==========================================\n');

    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        // 1. Load keys
        console.log('Loading beneficiary keys...');
        const keys = {
            ethereum: keyUtils.loadBeneficiaryKeysFromFile(),
            quantum: keyUtils.loadBeneficiaryQuantumKeys()
        };
        console.log(`Beneficiary address: ${keys.ethereum.address}`);

        // 2. Configuration
        const config = loadClaimConfig();
        console.log(`Environment: ${config.environment}`);
        console.log(`Key provider: ${new URL(config.keyProviderUrl).host}`);

        // 3. Network selection
        console.log('\n📡 Select network:');
        console.log('1. Ethereum');
        console.log('2. Arbitrum');
        const networkChoice = (await question('Your choice (1-2): ')).trim();
        if (!['1', '2'].includes(networkChoice)) {
            throw new Error('Invalid network selection. Please choose 1 or 2.');
        }
        const network = networkChoice === '1' ? 'ethereum' : 'arbitrum';
        console.log(`Ethereum providers: ${describeProviders(config.providers.ethereum)}`);
        if (network === 'arbitrum') {
            console.log(`Arbitrum providers: ${describeProviders(config.providers.arbitrum)}`);
        }

        // 4. Inheritance ID
        const inheritanceId = (await question('\n🔑 Enter the inheritance ID to claim (0x...): ')).trim();
        if (!/^0x[0-9a-fA-F]{64}$/.test(inheritanceId)) {
            throw new Error('Invalid inheritance ID format (expected 0x followed by 64 hex characters)');
        }

        // 5. Claim
        console.log('\n🚀 Starting inheritance claim process...');
        const result = await claimInheritance({
            config,
            network,
            inheritanceId,
            keys,
            readers: buildReaders(config)
        });
        console.log(`Decrypted asset size: ${formatters.formatBytes(result.plaintext.length)}`);

        // 6. Save without overwriting an existing file
        const filename = safeFileName(inheritanceId, result.fileType);
        const filepath = path.join(process.cwd(), filename);
        fs.writeFileSync(filepath, result.plaintext, { flag: 'wx' });

        console.log('\n🎉 Inheritance claimed successfully!');
        console.log(`📁 File saved to: ${filepath}`);
    } catch (error) {
        if (error.code === 'EEXIST') {
            error.message = `${error.path} already exists. Move it away and run the claim again.`;
        }
        reportFailure(error);
        process.exitCode = 1;
    } finally {
        rl.close();
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };
