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
 * 3. Refund remaining ETH from the beneficiary wallet to the gas wallet
 */

require('dotenv').config();
const { ethers } = require('ethers');
const readline = require('readline');
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
    walletUtils,
    testatorDataUtils
} = require('./utils/shared-utils');

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

// Formatting function now uses shared utility
const formatTimestamp = formatters.formatTimestamp;


// =============================================================================
// Blockchain & Network Functions
// =============================================================================

// Provider setup function now uses shared utility
const setupProvider = (networkConfig) => networkUtils.setupProvider(networkConfig, question);

// Contract address functions now use shared utilities
const getContractAddressFromProxy = networkUtils.getContractAddressFromProxy;

// Contract address for network function now uses shared utility
const getContractAddressForNetwork = (provider, networkConfig) =>
  networkUtils.getContractAddressForNetwork(provider, networkConfig, question);

// =============================================================================
// Inheritance Query Functions
// =============================================================================

/**
 * Get inheritance details from the contract
 * @param {ethers.Contract} contract Inheritor contract instance
 * @param {string} inheritanceId The inheritance ID to query
 * @returns {Promise<Object>} The inheritance details
 */
async function getInheritanceDetails(contract, inheritanceId) {
  const inheritance = await contract.inheritances(inheritanceId);
  return {
    id: inheritanceId,
    testatorEOA: inheritance.testatorEOA,
    testatorSAA: inheritance.testatorSAA,
    beneficiaryEOA: inheritance.beneficiaryEOA,
    beneficiarySAA: inheritance.beneficiarySAA,
    gracePeriod: inheritance.gracePeriod.toString(),
    state: parseInt(inheritance.state),
    stateName: STATE_NAMES[parseInt(inheritance.state)],
    arweaveTransactionId: inheritance.arweaveTransactionId,
    scheduledTransferTime: inheritance.scheduledTransferTime.toString(),
    encryptedTestatorData: inheritance.encryptedTestatorData
  };
}

/**
 * Find inheritances for a beneficiary using the contract's beneficiaryInheritances mapping
 * @param {ethers.Contract} contract Inheritor contract
 * @param {string} beneficiaryAddress Ethereum address of the beneficiary
 * @returns {Promise<Array<string>>} Array of inheritance IDs
 */
async function fetchBeneficiaryInheritances(contract, beneficiaryAddress) {
  console.log(`\nFetching inheritances for ${beneficiaryAddress} from contract...`);

  try {
    // Call the getBeneficiaryInheritances function
    const inheritanceIds = await contract.getBeneficiaryInheritances(beneficiaryAddress);

    return inheritanceIds;
  } catch (error) {
    console.error(`Error fetching inheritances from contract: ${error.message}`);
    throw error;
  }
}

/**
 * Display all inheritances for a beneficiary - Optimized with exportContractForMigration
 * @param {ethers.Contract} contract - Inheritor contract instance
 * @param {string} beneficiaryAddress - Ethereum address of the beneficiary (0x...)
 */
async function displayBeneficiaryInheritances(contract, beneficiaryAddress) {

  try {
    // Fetch inheritance IDs from the contract
    const inheritanceIds = await fetchBeneficiaryInheritances(contract, beneficiaryAddress);

    if (inheritanceIds.length === 0) {
      console.log('No inheritances found for this beneficiary.');
      await question('\nPress Enter to return to the main menu...');
      return;
    }

    console.log('Fetching details...');

    // Load beneficiary quantum keys for testatorData decryption
    let quantumKeys = null;
    try {
      quantumKeys = keyUtils.loadBeneficiaryQuantumKeys();
    } catch (error) {
      console.log('Note: Quantum keys not found. TestatorData will not be decrypted.');
    }

    // Fetch details for each inheritance
    const inheritances = [];
    for (const inheritanceId of inheritanceIds) {
      try {
        const details = await getInheritanceDetails(contract, inheritanceId);
        inheritances.push(details);
      } catch (error) {
        console.log(`Error fetching details for inheritance ${inheritanceId}: ${error.message}`);
      }
    }

    console.log('\n=== Your Inheritances ===');
    let index = 1;

    for (const inheritance of inheritances) {
      // Only display if not revoked (convert BigInt to Number for comparison)
      if (Number(inheritance.state) !== INHERITANCE_STATES.REVOKED) {
        console.log(`\n${index}. Inheritance ID: ${inheritance.id}`);

        // Try to decrypt and display testator name and message
        let testatorName = null;
        let testatorMessage = null;
        let decryptionSucceeded = false;
        if (quantumKeys && inheritance.encryptedTestatorData) {
          try {
            if (!inheritance.encryptedTestatorData || inheritance.encryptedTestatorData.length < 10) {
              // Empty or malformed data - skip decryption
            } else {
              const decryptedData = testatorDataUtils.decryptTestatorData(
                inheritance.encryptedTestatorData,
                quantumKeys.privateKey
              );
              testatorName = decryptedData.name;
              testatorMessage = decryptedData.message;
              decryptionSucceeded = true;
            }
          } catch (error) {
            // Check if it's because of missing ML-KEM recipient (iOS-only encryption)
            if (error.message.includes('External ML-KEM recipient not found')) {
              console.log(`   [Note] This inheritance was created for iOS-only decryption`);
            } else if (error.message.includes('Unsupported state or unable to authenticate data')) {
              console.log(`   [Note] Decryption failed - this may be encrypted for a different beneficiary`);
            }
          }
        }

        // Display testator info
        if (testatorName) {
          console.log(`   Testator: ${testatorName} (${inheritance.testatorEOA})`);
        } else {
          console.log(`   Testator: ${inheritance.testatorEOA}`);
        }

        // Display message - only if decryption succeeded
        if (decryptionSucceeded) {
          if (testatorMessage && testatorMessage.trim() !== '') {
            console.log(`   Message: "${testatorMessage}"`);
          } else {
            console.log(`   Message: none`);
          }
        }

        console.log(`   State: ${inheritance.stateName}`);

        // Only show scheduled transfer time if set
        if (BigInt(inheritance.scheduledTransferTime) > 0n) {
          console.log(`   Scheduled Transfer: ${formatTimestamp(inheritance.scheduledTransferTime)}`);
        }

        index++;
      }
    }

    // Wait for user acknowledgment
    await question('\nPress Enter to return to the main menu...');

  } catch (error) {
    console.error(`Error displaying inheritances: ${error.message}`);
    await question('\nPress Enter to return to the main menu...');
  }
}

// =============================================================================
// Core Check Functions
// =============================================================================

/**
 * Check if an inheritance is claimable by the beneficiary
 * This function verifies claimability and can update the contract state
 *
 * @param {ethers.Contract} contract - Inheritor contract instance
 * @param {Object} beneficiaryKeys - Object containing {address: string, privateKey: string, publicKey: string}
 * @param {string} inheritanceId - The inheritance ID to check (0x... format)
 * @param {ethers.Wallet} signer - Gas wallet signer for funding operations
 * @param {ethers.Provider} provider - Network provider (JsonRpcProvider)
 * @param {string} contractAddress - Contract address (0x...)
 */
async function checkInheritanceClaimability(contract, beneficiaryKeys, inheritanceId, signer, provider, contractAddress) {
  try {
    // First, check if the inheritance exists and the user is the beneficiary
    console.log(`\nChecking inheritance ${inheritanceId}...`);

    const inheritanceDetails = await getInheritanceDetails(contract, inheritanceId);
    console.log('\n=== Inheritance Details ===');
    console.log(`ID: ${inheritanceId}`);
    console.log(`Current State: ${inheritanceDetails.stateName}`);
    console.log(`Testator EOA: ${inheritanceDetails.testatorEOA}`);
    console.log(`Beneficiary EOA: ${inheritanceDetails.beneficiaryEOA}`);

    // Check if the user is the beneficiary
    if (inheritanceDetails.beneficiaryEOA.toLowerCase() !== beneficiaryKeys.address.toLowerCase()) {
      console.log('\n⚠️ WARNING: You are not the beneficiary of this inheritance!');
      console.log(`Expected beneficiary: ${inheritanceDetails.beneficiaryEOA}`);
      console.log(`Your address: ${beneficiaryKeys.address}`);
      const continueAnyway = await question('\nContinue anyway? (yes/no): ');
      if (continueAnyway.toLowerCase() !== 'yes') {
        return;
      }
    }

    // Create beneficiary wallet
    const beneficiaryWallet = new ethers.Wallet(beneficiaryKeys.privateKey, provider);

    // Check beneficiary wallet balance
    const beneficiaryBalance = await provider.getBalance(beneficiaryWallet.address);
    console.log(`\nBeneficiary wallet balance: ${ethers.formatEther(beneficiaryBalance)} ETH`);

    // Create contract instance with beneficiary wallet
    const beneficiaryContract = new ethers.Contract(contractAddress, CONTRACT_ABIS.INHERITOR_ABI, beneficiaryWallet);

    // Check if current state is already claimable
    if (inheritanceDetails.state === INHERITANCE_STATES.CLAIMABLE) {
      console.log('\n✅ This inheritance is already CLAIMABLE!');
      return;
    } else if (inheritanceDetails.state === INHERITANCE_STATES.CLAIMED) {
      console.log('\n🔵 This inheritance has already been CLAIMED!');
      return;
    } else if (inheritanceDetails.state === INHERITANCE_STATES.REVOKED) {
      console.log('\n🛑 This inheritance has been REVOKED by the testator.');
      return;
    } else if (inheritanceDetails.state === INHERITANCE_STATES.PURGED) {
      console.log('\n⚪ This inheritance has been PURGED from the system.');
      return;
    }

    // Estimate gas for isClaimable call
    console.log('\nEstimating gas for isClaimable call...');
    let estimatedGas;
    try {
      estimatedGas = await beneficiaryContract.isClaimable.estimateGas(inheritanceId);
      // Add buffer
      estimatedGas = BigInt(Math.floor(Number(estimatedGas) * GAS_CONSTANTS.SAFETY_MULTIPLIER));
    } catch (error) {
      console.log(`Could not estimate gas: ${error.message}`);
      estimatedGas = BigInt(GAS_CONSTANTS.FALLBACK_GAS_LIMIT); // Fallback gas limit
      console.log(`Using fallback gas limit of ${estimatedGas}`);
    }

    // Get current gas price
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;
    const gasCost = gasPrice * estimatedGas;

    console.log(`Estimated gas cost: ${ethers.formatEther(gasCost)} ETH`);

    // Check if beneficiary has sufficient funds
    if (beneficiaryBalance < gasCost) {
      console.log(`\n⚠️ Insufficient funds for transaction.`);
      console.log(`Required: ${ethers.formatEther(gasCost)} ETH`);
      console.log(`Available: ${ethers.formatEther(beneficiaryBalance)} ETH`);
      console.log(`\n💡 Please use menu option 3 to fund your beneficiary wallet, then try again.`);
      return;
    }

    // Now call isClaimable
    console.log('\nChecking if inheritance is claimable...');
    const isClaimableResult = await beneficiaryContract.isClaimable(inheritanceId, {
      gasLimit: estimatedGas
    });

    console.log(`Transaction sent. Waiting for confirmation...`);

    // Wait for transaction to be mined
    // isClaimable returns a boolean but also may update the contract state
    // so we need to wait for confirmation
    await isClaimableResult.wait();

    // Get updated inheritance details
    console.log('\nRetrieving updated inheritance state...');
    const updatedDetails = await getInheritanceDetails(contract, inheritanceId);

    console.log('\n=== Updated Inheritance State ===');
    console.log(`Current State: ${updatedDetails.stateName}`);

    if (updatedDetails.state === INHERITANCE_STATES.CLAIMABLE) {
      console.log('\n✅ RESULT: This inheritance is now CLAIMABLE!');
    } else {
      console.log('\n❌ RESULT: This inheritance is NOT YET CLAIMABLE.');
      console.log('Possible reasons:');

      // Check if testator has a verifier configured
      let hasVerifier = false;
      try {
        const verifierAddress = await contract.testatorVerifier(updatedDetails.testatorEOA);
        hasVerifier = verifierAddress !== ethers.ZeroAddress;
      } catch (error) {
        console.log('Could not check verifier status');
      }

      console.log('- The testator has recently checked in');
      console.log('- The grace period has not expired');
      if (hasVerifier) {
        console.log('- Verification is required but not completed');
      }
    }

  } catch (error) {
    if (error.message.includes('insufficient funds')) {
      console.error(`\n⚠️ ERROR: Operation cancelled due to insufficient funds.`);
    } else if (error.message.includes('Fund transfer failed')) {
      console.error(`\n⚠️ ERROR: Unable to transfer funds to beneficiary wallet.`);
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

    // Set up provider
    const provider = await setupProvider(networkConfig);
    const signer = new ethers.Wallet(gasWalletKey, provider);

    // Get contract address
    const contractAddress = await getContractAddressForNetwork(provider, networkConfig);

    // Create contract instance
    console.log(`Using Inheritor contract at address: ${contractAddress}`);
    const code = await provider.getCode(contractAddress);
    if (code === '0x') {
      throw new Error(`No contract found at address ${contractAddress}`);
    }
    const contract = new ethers.Contract(contractAddress, CONTRACT_ABIS.INHERITOR_ABI, signer);

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
          await displayBeneficiaryInheritances(contract, beneficiaryKeys.address);
          break;

        case '2':
          // Check if inheritance is claimable
          const inheritanceId = await question('\nEnter the Inheritance ID (hex string starting with 0x): ');
          if (!/^0x[a-fA-F0-9]{64}$/.test(inheritanceId)) {
            console.error('Invalid Inheritance ID format. Must be a 32-byte hex string with 0x prefix.');
          } else {
            await checkInheritanceClaimability(contract, beneficiaryKeys, inheritanceId, signer, provider, contractAddress);
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