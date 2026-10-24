#!/usr/bin/env node

/**
 * SPDX-License-Identifier: CC0-1.0
 *
 * Inheritor Beneficiary Check Tool
 *
 * This work has been dedicated to the public domain under the CC0 1.0 Universal Public Domain Dedication.
 * To the extent possible under law, the author(s) have waived all copyright and related or neighboring
 * rights to this work. This work is published from: Netherlands.
 *
 * For more information, see: https://creativecommons.org/publicdomain/zero/1.0/
 *
 * This script allows beneficiaries to check the status of their inheritances
 * and verify if they are claimable. It provides functions to:
 * 1. View all inheritances designated to a beneficiary
 * 2. Check if specific inheritances are claimable
 * 3. Fund the beneficiary wallet from the gas wallet
 * 4. Refund remaining ETH from the beneficiary wallet to the gas wallet
 *
 * Inheritances are read from Inheritor contract v3 through the address registry, verified by two independent
 * providers at the finalized and the latest block (see scripts/utils/claim-context.js). Only the isClaimable
 * transaction and the wallet functions use the single RPC provider chosen at startup.
 */

require('dotenv').config();
const { ethers } = require('ethers');
const readline = require('readline');
const {
    NETWORK_CONFIGS,
    INHERITANCE_STATES,
    STATE_NAMES,
    GAS_CONSTANTS,
    CONTRACT_ABIS,
    networkUtils,
    keyUtils,
    walletUtils
} = require('./utils/shared-utils');
const { loadClaimConfig, buildReaders, describeProviders } = require('./utils/claim-config');
const { readClaimContext, readBeneficiaryRecords, checkRecord } = require('./utils/claim-context');
const { decryptMetadata } = require('./utils/envelope-v2');

// Gas limit for isClaimable when estimation fails
const FALLBACK_GAS_LIMIT = 300000n;

// =============================================================================
// Configuration Constants (now imported from shared-utils)
// =============================================================================

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// =============================================================================
// User Interface & Helper Functions
// =============================================================================

/**
 * Prompt the user for input with a question
 * @param {string} query The question to ask
 * @returns {Promise<string>} User's response
 */
function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Beneficiary key loading function now uses shared utility
const loadBeneficiaryKeysFromFile = keyUtils.loadBeneficiaryKeysFromFile;

// =============================================================================
// Blockchain & Network Functions
// =============================================================================

// Provider setup function now uses shared utility
const setupProvider = (networkConfig) => networkUtils.setupProvider(networkConfig, question);

// =============================================================================
// Inheritance Query Functions
// =============================================================================

/**
 * Display all inheritances for a beneficiary, read from the verified contract. The testator's name and message are
 * decrypted only from these verified records, under the envelope v2 metadata context.
 * @param {Object} claim - { config, network, readers }
 * @param {string} beneficiaryAddress - Ethereum address of the beneficiary (0x...)
 */
async function displayBeneficiaryInheritances(claim, beneficiaryAddress) {
  try {
    console.log(`\nFetching inheritances for ${beneficiaryAddress} (verified by two providers)...`);
    const listing = await readBeneficiaryRecords({
      environment: claim.config.environment,
      registry: claim.config.registry,
      network: claim.network,
      beneficiary: beneficiaryAddress,
      readers: claim.readers
    });
    console.log(`Contract ${listing.contractAddress} (version ${listing.version})`);

    if (listing.records.length === 0) {
      console.log('No inheritances found for this beneficiary.');
      await question('\nPress Enter to return to the main menu...');
      return;
    }

    // Load beneficiary quantum keys for testatorData decryption
    let quantumKeys = null;
    try {
      quantumKeys = keyUtils.loadBeneficiaryQuantumKeys();
    } catch (error) {
      console.log('Note: Quantum keys not found. TestatorData will not be decrypted.');
    }

    console.log('\n=== Your Inheritances ===');
    let index = 1;

    for (const inheritance of listing.records) {
      // Revoked inheritances are not shown
      if (inheritance.state === INHERITANCE_STATES.REVOKED) {
        continue;
      }
      console.log(`\n${index}. Inheritance ID: ${inheritance.inheritanceId}`);

      // Try to decrypt and display testator name and message
      let metadata = null;
      if (quantumKeys && inheritance.testatorData && inheritance.testatorData.length >= 10) {
        try {
          metadata = decryptMetadata(inheritance.testatorData, quantumKeys.privateKey, {
            deploymentIdentity: listing.deploymentIdentity,
            inheritanceId: inheritance.inheritanceId,
            testator: inheritance.testatorEOA,
            beneficiary: inheritance.beneficiaryEOA,
            purpose: 'metadata'
          });
        } catch (error) {
          console.log(`   [Note] Testator name and message could not be decrypted: ${error.message}`);
        }
      }

      if (metadata && metadata.name) {
        console.log(`   Testator: ${metadata.name} (${inheritance.testatorEOA})`);
      } else {
        console.log(`   Testator: ${inheritance.testatorEOA}`);
      }
      if (metadata) {
        const message = typeof metadata.message === 'string' ? metadata.message.trim() : '';
        console.log(`   Message: ${message ? `"${message}"` : 'none'}`);
      }
      console.log(`   State: ${STATE_NAMES[inheritance.state]}`);
      index++;
    }

    await question('\nPress Enter to return to the main menu...');
  } catch (error) {
    console.error(`Error displaying inheritances: ${error.message}`);
    await question('\nPress Enter to return to the main menu...');
  }
}

// =============================================================================
// Core Check Functions
// =============================================================================

/** Reads the verified claim context and prints the record at both blocks. */
async function readAndShowContext(claim, inheritanceId) {
  const context = await readClaimContext({
    environment: claim.config.environment,
    registry: claim.config.registry,
    network: claim.network,
    inheritanceId,
    readers: claim.readers
  });
  const record = context.latest.record;
  console.log('\n=== Inheritance Details (verified) ===');
  console.log(`ID: ${inheritanceId}`);
  console.log(`Contract: ${context.contractAddress} (version ${context.latest.version})`);
  console.log(`Providers: ${context.providers.join(', ')}`);
  console.log(`State at the latest block (${context.latest.block.number}): ${STATE_NAMES[record.state]}`);
  console.log(`State at the finalized block (${context.finalized.block.number}): ${STATE_NAMES[context.finalized.record.state]}`);
  console.log(`Contract paused: ${context.latest.paused || context.finalized.paused ? 'yes' : 'no'}`);
  console.log(`Testator EOA: ${record.testatorEOA}`);
  console.log(`Beneficiary EOA: ${record.beneficiaryEOA}`);
  return context;
}

/**
 * Check if an inheritance is claimable by the beneficiary. If it is still Designated, offers to send the
 * isClaimable transaction, which makes it Claimable once the testator's deadline (and any verification) has passed.
 *
 * @param {Object} claim - { config, network, readers }
 * @param {Object} beneficiaryKeys - Object containing {address: string, privateKey: string, publicKey: string}
 * @param {string} inheritanceId - The inheritance ID to check (0x... format)
 * @param {ethers.Provider} provider - Network provider for the transaction (JsonRpcProvider)
 */
async function checkInheritanceClaimability(claim, beneficiaryKeys, inheritanceId, provider) {
  try {
    console.log(`\nChecking inheritance ${inheritanceId}...`);
    const context = await readAndShowContext(claim, inheritanceId);
    const record = context.latest.record;

    try {
      checkRecord(context, beneficiaryKeys.address);
      console.log('\n✅ This inheritance is CLAIMABLE at the finalized and the latest block.');
      console.log('   Run Beneficiary_Claim.js to claim it.');
      return;
    } catch (denial) {
      if (denial.code !== 'not_claimable' || record.state !== INHERITANCE_STATES.DESIGNATED) {
        console.log(`\n${denial.message}`);
        return;
      }
    }

    // Designated: the isClaimable transaction may make it Claimable
    const beneficiaryWallet = new ethers.Wallet(beneficiaryKeys.privateKey, provider);
    const beneficiaryContract = new ethers.Contract(context.contractAddress, CONTRACT_ABIS.INHERITOR_ABI, beneficiaryWallet);
    const beneficiaryBalance = await provider.getBalance(beneficiaryWallet.address);
    console.log(`\nBeneficiary wallet balance: ${ethers.formatEther(beneficiaryBalance)} ETH`);

    // Estimate gas for isClaimable call
    console.log('\nEstimating gas for isClaimable call...');
    let estimatedGas;
    try {
      estimatedGas = await beneficiaryContract.isClaimable.estimateGas(inheritanceId);
      estimatedGas = BigInt(Math.floor(Number(estimatedGas) * GAS_CONSTANTS.SAFETY_MULTIPLIER));
    } catch (error) {
      console.log(`Could not estimate gas: ${error.message}`);
      estimatedGas = FALLBACK_GAS_LIMIT;
      console.log(`Using fallback gas limit of ${estimatedGas}`);
    }

    const feeData = await provider.getFeeData();
    const gasCost = feeData.gasPrice * estimatedGas;
    console.log(`Estimated gas cost: ${ethers.formatEther(gasCost)} ETH`);

    if (beneficiaryBalance < gasCost) {
      console.log(`\n⚠️ Insufficient funds for transaction.`);
      console.log(`Required: ${ethers.formatEther(gasCost)} ETH`);
      console.log(`Available: ${ethers.formatEther(beneficiaryBalance)} ETH`);
      console.log(`\n💡 Please use menu option 3 to fund your beneficiary wallet, then try again.`);
      return;
    }

    const send = await question('\nSend the isClaimable transaction now? (yes/no): ');
    if (send.toLowerCase() !== 'yes') {
      return;
    }

    console.log('\nChecking if inheritance is claimable...');
    const tx = await beneficiaryContract.isClaimable(inheritanceId, { gasLimit: estimatedGas });
    console.log(`Transaction sent: ${tx.hash}. Waiting for confirmation...`);
    await tx.wait();

    console.log('\nRetrieving updated inheritance state...');
    const updated = await readAndShowContext(claim, inheritanceId);
    const latestState = updated.latest.record.state;

    if (latestState === INHERITANCE_STATES.CLAIMABLE) {
      console.log('\n✅ RESULT: This inheritance is now CLAIMABLE at the latest block.');
      console.log('   It can be claimed once that block is finalized, in about 15–20 minutes.');
    } else {
      console.log('\n❌ RESULT: This inheritance is NOT YET CLAIMABLE.');
      console.log('Possible reasons:');
      console.log('- The testator has recently checked in');
      console.log('- The grace period has not expired');
      const verifier = await beneficiaryContract.testatorVerifier(record.testatorEOA).catch(() => ethers.ZeroAddress);
      if (verifier !== ethers.ZeroAddress) {
        console.log('- Verification is required but not completed');
      }
    }
  } catch (error) {
    if (error.message.includes('insufficient funds')) {
      console.error(`\n⚠️ ERROR: Operation cancelled due to insufficient funds.`);
    } else {
      console.error(`\n⚠️ ERROR: ${error.message}`);
    }
  }
}


// =============================================================================
// Main Program Loop
// =============================================================================

/**
 * Main execution function
 */
async function main() {
  console.log('=== Inheritor Beneficiary Check Tool ===');
  console.log('This tool allows you to check if an inheritance is claimable.');
  console.log('');

  try {
    // Load beneficiary keys from exported JSON file
    let beneficiaryKeys;
    try {
      beneficiaryKeys = loadBeneficiaryKeysFromFile();
      console.log(`Beneficiary address: ${beneficiaryKeys.address}`);
    } catch (keyError) {
      console.error('\n⚠️  Key Loading Error:');
      console.error(keyError.message);
      console.log('\nPlease ensure that:');
      console.log('1. You have exported your keys from the iOS Inheritor app');
      console.log('2. The exported JSON file is placed in the ./keys/ directory');
      console.log('3. The file is named in the format: InheritorKeys_YYYY-MM-DD.json');
      throw new Error('Failed to load beneficiary keys');
    }

    // Get gas wallet private key from environment variable
    let gasWalletKey = process.env.GAS_WALLET_PRIVATE_KEY;
    if (!gasWalletKey) {
      console.error('\n⚠️  Environment Variable Error:');
      console.error('GAS_WALLET_PRIVATE_KEY not found in environment variables.');
      console.log('\nPlease ensure that:');
      console.log('1. You have a .env file in the project root directory');
      console.log('2. The .env file contains: GAS_WALLET_PRIVATE_KEY=...');
      console.log('3. The private key is 64 hex characters (with or without 0x prefix)');
      throw new Error('Gas wallet private key not configured');
    }

    // Normalize gas wallet private key format (add 0x prefix if missing)
    if (!gasWalletKey.startsWith('0x')) {
      gasWalletKey = '0x' + gasWalletKey;
    }

    // Validate the gas wallet private key
    let gasWallet;
    try {
      gasWallet = new ethers.Wallet(gasWalletKey);
      console.log(`Gas wallet address: ${gasWallet.address}`);
    } catch (error) {
      throw new Error('Invalid private key for gas wallet in .env file (must be 64 hex characters, with or without 0x prefix)');
    }

    // Select network
    console.log('\n📡 Select network:');
    console.log('1. Ethereum');
    console.log('2. Arbitrum');
    const networkChoice = await question('Your choice (1-2): ');

    if (!['1', '2'].includes(networkChoice)) {
      throw new Error('Invalid network selection. Please choose 1 or 2.');
    }

    const networkConfig = networkChoice === '1'
      ? NETWORK_CONFIGS.ethereum
      : NETWORK_CONFIGS.arbitrum;
    console.log(`Selected network: ${networkConfig.name}`);

    // Verified reads for the claim check, through two independent providers
    const config = loadClaimConfig();
    const network = networkChoice === '1' ? 'ethereum' : 'arbitrum';
    const claim = { config, network, readers: buildReaders(config) };
    console.log(`Environment: ${config.environment}`);
    console.log(`Verified reads via: ${describeProviders(config.providers[network])}`);

    // Single provider for transactions (isClaimable, funding, refunds)
    console.log('\nThe provider below is used only to send transactions.');
    const provider = await setupProvider(networkConfig);
    const signer = new ethers.Wallet(gasWalletKey, provider);

    // Main menu loop
    let running = true;
    while (running) {
      console.log('\n=== Main Menu ===');
      const action = await question(
        '1. Show received Inheritances\n' +
        '2. Check if inheritance is claimable\n' +
        '3. Fund beneficiary wallet\n' +
        '4. Refund remaining ETH to gas wallet\n' +
        '5. Exit\n' +
        'Choose an action (1-5): '
      );

      switch (action) {
        case '1':
          // Show received Inheritances
          await displayBeneficiaryInheritances(claim, beneficiaryKeys.address);
          break;

        case '2':
          // Check if inheritance is claimable
          const inheritanceId = await question('\nEnter the Inheritance ID (hex string starting with 0x): ');
          if (!/^0x[a-fA-F0-9]{64}$/.test(inheritanceId)) {
            console.error('Invalid Inheritance ID format. Must be a 32-byte hex string with 0x prefix.');
          } else {
            await checkInheritanceClaimability(claim, beneficiaryKeys, inheritanceId.toLowerCase(), provider);
          }
          break;

        case '3':
          // Fund beneficiary wallet
          await walletUtils.fundWallet(beneficiaryKeys, signer, provider, "Beneficiary", question);
          break;

        case '4':
          // Refund remaining ETH
          await walletUtils.refundWallet(beneficiaryKeys, signer.address, provider, "Beneficiary", question);
          break;

        case '5':
          // Exit
          console.log('Exiting...');
          running = false;
          break;

        default:
          console.log('Invalid choice. Please select 1-5.');
      }
    }
  } catch (error) {
    console.error('\nError:', error.message);
  } finally {
    rl.close();
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  rl.close();
});