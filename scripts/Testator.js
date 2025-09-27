#!/usr/bin/env node

/**
 * Inheritor Emergency Management Tool
 * 
 * This script allows testators to manage their digital inheritances in emergency situations.
 * It provides functions to:
 * 1. View the Digital Will information
 * 2. Perform a check-in to reset inheritance timers
 * 3. Revoke inheritances
 * 4. Return unused ETH to the gas wallet
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
    walletUtils
} = require('./utils/shared-utils');

// =============================================================================
// Configuration Constants (now imported from shared-utils)
// =============================================================================

// Create readline interface
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

// Key loading function now uses shared utility
const loadTestatorKeysFromFile = keyUtils.loadTestatorKeysFromFile;

// Formatting functions now use shared utilities
const formatDuration = formatters.formatDuration;
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
 * Get all inheritances for a testator using optimized event logs with deployment block
 * @param {ethers.Contract} contract Inheritor contract
 * @param {string} testatorAddress Testator's address
 * @returns {Promise<Array<string>>} Array of inheritance IDs
 */
async function getTestatorInheritances(contract, testatorAddress) {
  console.log(`Searching for inheritances via events for ${testatorAddress}...`);

  try {
    // Get deployment block to optimize query range
    const startBlock = await contractUtils.getDeploymentBlockForContract(contract);

    // Create a filter for AddInheritance events where testatorEOA is our address
    const filter = contract.filters.AddInheritance(null, testatorAddress, null);

    // Query all matching events with optimized block range
    console.log('Fetching event logs...');
    const events = await contract.queryFilter(filter, startBlock, 'latest');

    // Extract the inheritance IDs from the events
    return events.map(event => event.args.inheritanceId);
  } catch (error) {
    console.error(`Error fetching inheritances via events: ${error.message}`);

    // Fall back to direct mapping access as a last resort
    console.log('Attempting fallback method...');
    return getInheritancesViaMapping(contract, testatorAddress);
  }
}

/**
 * Fallback method to get inheritances via direct mapping access
 * @param {ethers.Contract} contract Inheritor contract
 * @param {string} testatorAddress Testator's address
 * @returns {Promise<Array<string>>} Array of inheritance IDs
 */
async function getInheritancesViaMapping(contract, testatorAddress) {
  try {
    // First try the array return version (depends on contract version)
    const inheritances = await contract.digitalWill(testatorAddress);
    return inheritances;
  } catch (error) {
    // Fallback to iterative approach
    const inheritances = [];
    let index = 0;
    
    while (true) {
      try {
        const inheritanceId = await contract.digitalWill(testatorAddress, index);
        inheritances.push(inheritanceId);
        index++;
      } catch (error) {
        break;
      }
    }
    
    return inheritances;
  }
}

/**
 * Fallback method for viewDigitalWill when exportContractForMigration fails
 * @param {ethers.Contract} contract - Inheritor contract instance
 * @param {string} testatorAddress - Testator's Ethereum address
 */
async function viewDigitalWillFallback(contract, testatorAddress) {
  // Always get fresh inheritance IDs from blockchain
  const inheritanceIds = await getTestatorInheritances(contract, testatorAddress);

  if (inheritanceIds.length === 0) {
    console.log('No inheritances found for this testator.');
    return;
  }

  console.log(`Found ${inheritanceIds.length} inheritance(s).`);

  // Get current check-in information
  const lastCheckIn = await contract.testatorLastCheckIn(testatorAddress);
  const checkInInterval = await contract.checkInInterval(testatorAddress);

  // Display check-in information
  console.log('\n=== Check-in Information ===');
  console.log(`Last Check-in: ${formatTimestamp(lastCheckIn)}`);
  console.log(`Check-in Interval: ${formatDuration(checkInInterval)}`);

  // Safely calculate next check-in
  const nextCheckInTime = lastCheckIn + checkInInterval;
  console.log(`Next Check-in Due: ${formatTimestamp(nextCheckInTime)}`);

  // Get details for each inheritance
  console.log('\n=== Inheritances ===');

  for (const id of inheritanceIds) {
    // Get fresh details from blockchain
    const details = await getInheritanceDetails(contract, id);

    // Skip displaying purged inheritances
    if (details.state === INHERITANCE_STATES.PURGED) {
      continue;
    }

    console.log(`\nInheritance ID: ${id}`);
    console.log(`State: ${details.stateName}`);
    console.log(`Beneficiary: ${details.beneficiaryEOA}`);
    console.log(`Grace Period: ${formatDuration(details.gracePeriod)}`);

    if (BigInt(details.scheduledTransferTime) > 0n) {
      console.log(`Scheduled Transfer: ${formatTimestamp(details.scheduledTransferTime)}`);
    }
  }
}

/**
 * Load inheritance details from the contract
 * @param {ethers.Contract} contract Inheritor contract
 * @param {string} inheritanceId Inheritance ID
 * @returns {Promise<Object>} Inheritance details
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
    scheduledTransferTime: inheritance.scheduledTransferTime.toString()
  };
}

// =============================================================================
// Core Testator Functions
// =============================================================================

/**
 * View Digital Will function - Optimized with exportContractForMigration
 * Fetches and displays all inheritances and check-in information
 *
 * @param {ethers.Contract} contract - Inheritor contract instance
 * @param {string} testatorAddress - Testator's Ethereum address (0x...)
 */
async function viewDigitalWill(contract, testatorAddress) {
  console.log(`\nFetching digital will information for ${testatorAddress}...`);

  try {
    // First, get all inheritance IDs from optimized events
    const inheritanceIds = await getTestatorInheritances(contract, testatorAddress);

    if (inheritanceIds.length === 0) {
      console.log('No inheritances found for this testator.');
      return;
    }

    console.log(`Found ${inheritanceIds.length} inheritance(s). Fetching complete data...`);

    // Use exportContractForMigration to get all data in one call
    const migrationData = await contract.exportContractForMigration(inheritanceIds);

    // Find the testator's data in the migration results
    let testatorIndex = -1;
    for (let i = 0; i < migrationData.testators.length; i++) {
      if (migrationData.testators[i].toLowerCase() === testatorAddress.toLowerCase()) {
        testatorIndex = i;
        break;
      }
    }

    if (testatorIndex >= 0) {
      // Display check-in information from migration data
      const lastCheckIn = Number(migrationData.lastCheckIns[testatorIndex]);
      const checkInInterval = Number(migrationData.checkInIntervals[testatorIndex]);

      console.log('\n=== Check-in Information ===');
      console.log(`Last Check-in: ${formatTimestamp(lastCheckIn)}`);
      console.log(`Check-in Interval: ${formatDuration(checkInInterval)}`);

      // Safely calculate next check-in
      const nextCheckInTime = lastCheckIn + checkInInterval;
      console.log(`Next Check-in Due: ${formatTimestamp(nextCheckInTime)}`);
    } else {
      console.log('\n⚠️  Warning: Could not find check-in information in migration data');
    }

    // Process and display inheritances from migration data
    const inheritances = contractUtils.processMigrationDataToInheritances(migrationData);

    console.log('\n=== Inheritances ===');

    for (const inheritance of inheritances) {
      // Skip displaying purged inheritances (convert BigInt to Number for comparison)
      if (Number(inheritance.state) === INHERITANCE_STATES.PURGED) {
        continue;
      }

      console.log(`\nInheritance ID: ${inheritance.id}`);
      console.log(`State: ${inheritance.stateName}`);
      console.log(`Beneficiary: ${inheritance.beneficiaryEOA}`);
      console.log(`Grace Period: ${formatDuration(inheritance.gracePeriod)}`);

      if (BigInt(inheritance.scheduledTransferTime) > 0n) {
        console.log(`Scheduled Transfer: ${formatTimestamp(inheritance.scheduledTransferTime)}`);
      }
    }

  } catch (error) {
    console.error('\n⚠️  Error fetching digital will data:', error.message);
    console.log('Falling back to individual queries...');

    // Fallback to original method if exportContractForMigration fails
    await viewDigitalWillFallback(contract, testatorAddress);
  }

  // Wait for user acknowledgment
  await question('\nPress Enter to return to the main menu...');
}

/**
 * Revoke all inheritances function
 * Permanently cancels all active inheritances
 *
 * @param {ethers.Contract} contract - Inheritor contract instance
 * @param {Object} testatorKeys - Object containing {address: string, privateKey: string, publicKey: string}
 * @param {ethers.Wallet} signer - Gas wallet signer for funding operations
 * @param {ethers.Provider} provider - Network provider (JsonRpcProvider)
 * @param {string} contractAddress - Contract address (0x...)
 */
async function revokeAllInheritances(contract, testatorKeys, signer, provider, contractAddress) {
  const confirmation = await question('Are you sure you want to revoke ALL inheritances? (yes/no): ');
  
  if (confirmation.toLowerCase() !== 'yes') {
    console.log('Revocation cancelled.');
    return;
  }
  
  try {
    console.log('Revoking all inheritances...');

    // Always get fresh inheritance data from blockchain using optimized method
    const inheritanceIds = await getTestatorInheritances(contract, testatorKeys.address);

    if (inheritanceIds.length === 0) {
      console.log('No inheritances found to revoke.');
      return;
    }

    // Use exportContractForMigration to get all inheritance details in one call
    let inheritances = [];
    try {
      console.log('Fetching inheritance details using exportContractForMigration...');
      const migrationData = await contract.exportContractForMigration(inheritanceIds);
      inheritances = contractUtils.processMigrationDataToInheritances(migrationData);
      console.log(`✅ Successfully loaded ${inheritances.length} inheritance details`);
    } catch (migrationError) {
      console.log('⚠️ exportContractForMigration failed, falling back to individual queries...');
      // Fallback to individual queries
      for (const id of inheritanceIds) {
        const details = await getInheritanceDetails(contract, id);
        inheritances.push(details);
      }
    }
    
    // Create testator wallet for signing revocation transactions
    const testatorWallet = new ethers.Wallet(testatorKeys.privateKey, provider);
    console.log(`Using testator wallet: ${testatorWallet.address}`);
    
    // Create a contract instance with the testator's wallet
    const testatorContract = new ethers.Contract(contractAddress, CONTRACT_ABIS.INHERITOR_ABI, testatorWallet);
    
    // Check testator wallet balance
    const testatorBalance = await provider.getBalance(testatorWallet.address);
    console.log(`Testator wallet balance: ${ethers.formatEther(testatorBalance)} ETH`);
    
    // Estimate gas for a single revocation to determine if funding is needed
    let gasCostPerRevocation;
    try {
      // Try to estimate gas for the first inheritance
      const revocableInheritances = inheritances.filter(inh => inh.state === 0);
      
      if (revocableInheritances.length === 0) {
        console.log('No revocable inheritances found.');
        return;
      }
      
      const firstRevocableInheritance = revocableInheritances[0];
      
      const estimatedGas = await testatorContract.revokeInheritance.estimateGas(firstRevocableInheritance.id);
      // Get current gas price
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice;
      // Calculate gas cost with safety buffer to account for network fluctuations
      gasCostPerRevocation = gasPrice * (estimatedGas * BigInt(GAS_CONSTANTS.SAFETY_MULTIPLIER));
      console.log(`Estimated gas cost per revocation: ${ethers.formatEther(gasCostPerRevocation)} ETH`);
    } catch (error) {
      console.log(`Could not estimate gas: ${error.message}`);
      gasCostPerRevocation = ethers.parseEther(GAS_CONSTANTS.FALLBACK_GAS_AMOUNT); // Fallback gas estimate
      console.log(`Using fallback gas estimate of ${ethers.formatEther(gasCostPerRevocation)} ETH per revocation`);
    }
    
    // Calculate total gas needed for all revocations
    const revocableInheritances = inheritances.filter(inh => inh.state === INHERITANCE_STATES.DESIGNATED);
    const totalGasNeeded = gasCostPerRevocation * BigInt(revocableInheritances.length);
    
    // Check if testator needs funding
    if (testatorBalance < totalGasNeeded) {
      console.log(`\nTestator wallet needs funding for gas. ${revocableInheritances.length} revocations needed.`);
      // Add safety buffer for funding
      const fundAmount = totalGasNeeded * BigInt(GAS_CONSTANTS.FUNDING_MULTIPLIER);
      
      const fundConfirmation = await question(
        `Do you want to transfer ${ethers.formatEther(fundAmount)} ETH from gas wallet to testator wallet? (yes/no): `
      );
      
      if (fundConfirmation.toLowerCase() === 'yes') {
        try {
          console.log(`\nTransferring funds to testator wallet...`);
          
          // Get gas wallet balance first
          const gasWalletBalance = await provider.getBalance(signer.address);
          console.log(`Gas wallet balance: ${ethers.formatEther(gasWalletBalance)} ETH`);
          
          // Check if gas wallet has enough funds
          if (gasWalletBalance < fundAmount) {
            console.error(`\n⚠️ ERROR: Gas wallet has insufficient funds`);
            console.log(`Required: ${ethers.formatEther(fundAmount)} ETH`);
            console.log(`Available: ${ethers.formatEther(gasWalletBalance)} ETH`);
            console.log(`\nPlease fund your gas wallet with at least ${ethers.formatEther(fundAmount - gasWalletBalance)} more ETH to continue.`);
            throw new Error('Insufficient funds in gas wallet');
          }
          
          const fundingTx = await signer.sendTransaction({
            to: testatorWallet.address,
            value: fundAmount
          });
          
          console.log(`Funding transaction sent: ${fundingTx.hash}`);
          console.log(`Waiting for transaction confirmation...`);
          await fundingTx.wait();
          
          // Verify the new balance
          const newBalance = await provider.getBalance(testatorWallet.address);
          console.log(`New testator wallet balance: ${ethers.formatEther(newBalance)} ETH`);
          
          if (newBalance < totalGasNeeded) {
            throw new Error('Testator wallet still has insufficient funds after transfer');
          }
        } catch (error) {
          // Check if it's an insufficient funds error
          if (error.message.includes('insufficient funds')) {
            // This is already handled above with better error message
            throw new Error('Operation cancelled due to insufficient funds');
          } else {
            console.error(`\n⚠️ ERROR: Failed to transfer funds: ${error.message}`);
            throw new Error('Fund transfer failed');
          }
        }
      } else {
        throw new Error('Revocation cancelled: testator wallet needs ETH for gas');
      }
    }
    
    // Process revocations using testator wallet
    for (const inheritance of inheritances) {
      // Only try to revoke inheritances that are in Designated state
      // Skip those that are Claimable, Claimed, Revoked, or Purged (convert BigInt to Number for comparison)
      if (Number(inheritance.state) === INHERITANCE_STATES.DESIGNATED) {
        try {
          console.log(`Revoking inheritance ${inheritance.id}...`);
          const tx = await testatorContract.revokeInheritance(inheritance.id, {
            gasLimit: BigInt(500000) // Increased fixed gas limit for safety
          });
          console.log(`Transaction sent: ${tx.hash}`);
          await tx.wait();
          console.log(`Inheritance ${inheritance.id} successfully revoked!`);
        } catch (error) {
          console.error(`Error revoking inheritance ${inheritance.id}: ${error.message}`);
        }
      } else {
        console.log(`Skipping inheritance ${inheritance.id} as it's in ${inheritance.stateName} state.`);
      }
    }
    
    console.log('Revocation process completed.');
  } catch (error) {
    // Provide a user-friendly error message
    if (error.message.includes('insufficient funds')) {
      console.error(`\n⚠️ ERROR: Operation cancelled due to insufficient funds in gas wallet.`);
      console.log(`Please add more ETH to your gas wallet address and try again.`);
    } else if (error.message.includes('Fund transfer failed')) {
      console.error(`\n⚠️ ERROR: Unable to transfer funds to testator wallet.`);
    } else if (error.message.includes('Testator wallet still has insufficient funds')) {
      console.error(`\n⚠️ ERROR: Transfer completed but testator wallet still has insufficient funds.`);
      console.log(`This can happen due to gas price fluctuations. Please try again with a larger amount.`);
    } else {
      console.error(`\n⚠️ ERROR during revocation process: ${error.message}`);
    }
  }
}

/**
 * Perform check-in function
 * Resets the timer on all testator's inheritances
 *
 * @param {Object} testatorKeys - Object containing {address: string, privateKey: string, publicKey: string}
 * @param {ethers.Wallet} signer - Gas wallet signer for funding operations
 * @param {ethers.Provider} provider - Network provider (JsonRpcProvider)
 * @param {string} contractAddress - Contract address (0x...)
 */
async function performCheckIn(testatorKeys, signer, provider, contractAddress) {
  const confirmation = await question('Are you sure you want to check-in? (yes/no): ');
  
  if (confirmation.toLowerCase() !== 'yes') {
    console.log('Check-in cancelled.');
    return;
  }
  
  try {
    console.log('Preparing for check-in...');
    
    console.log(`Gas wallet: ${signer.address}`);
    console.log(`Testator wallet: ${testatorKeys.address}`);
    
    // Create a testator wallet instance
    const testatorWallet = new ethers.Wallet(testatorKeys.privateKey, provider);
    
    // Verify the wallet is correct
    if (testatorWallet.address.toLowerCase() !== testatorKeys.address.toLowerCase()) {
      throw new Error('Private key does not match the testator address derived from mnemonic');
    }
    
    // Check testator wallet balance
    const testatorBalance = await provider.getBalance(testatorWallet.address);
    console.log(`Testator wallet balance: ${ethers.formatEther(testatorBalance)} ETH`);
    
    // Estimate gas needed for the check-in
    const testatorContract = new ethers.Contract(contractAddress, CONTRACT_ABIS.INHERITOR_ABI, testatorWallet);
    const estimatedGas = await testatorContract.checkIn.estimateGas(0);
    const gasBuffer = BigInt(Math.floor(Number(estimatedGas) * 1.2)); // 20% buffer
    
    // Get current gas price
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;
    
    // Calculate gas cost
    const gasCost = gasPrice * gasBuffer;
    console.log(`Estimated gas cost: ${ethers.formatEther(gasCost)} ETH`);
    
    // Check if the testator wallet needs funding
    if (testatorBalance < gasCost) {
      console.log(`\nTestator wallet needs funding for gas`);
      
      // Ask if user wants to fund the testator wallet from the gas wallet
      const fundConfirmation = await question(`Do you want to transfer ${ethers.formatEther(gasCost * BigInt(2))} ETH from gas wallet to testator wallet? (yes/no): `);
      
      if (fundConfirmation.toLowerCase() === 'yes') {
        try {
          // Transfer funds from gas wallet to testator wallet
          console.log(`\nTransferring funds to testator wallet...`);
          
          // Get gas wallet balance first
          const gasWalletBalance = await provider.getBalance(signer.address);
          console.log(`Gas wallet balance: ${ethers.formatEther(gasWalletBalance)} ETH`);
          
          // Check if gas wallet has enough funds
          const transferAmount = gasCost * BigInt(2);
          if (gasWalletBalance < transferAmount) {
            console.error(`\n⚠️ ERROR: Gas wallet has insufficient funds`);
            console.log(`Required: ${ethers.formatEther(transferAmount)} ETH`);
            console.log(`Available: ${ethers.formatEther(gasWalletBalance)} ETH`);
            console.log(`\nPlease fund your gas wallet with at least ${ethers.formatEther(transferAmount - gasWalletBalance)} more ETH to continue.`);
            throw new Error('Insufficient funds in gas wallet');
          }
          
          // Transfer double the estimated gas cost to be safe
          const fundingTx = await signer.sendTransaction({
            to: testatorWallet.address,
            value: transferAmount
          });
          
          console.log(`Funding transaction sent: ${fundingTx.hash}`);
          console.log(`Waiting for transaction confirmation...`);
          await fundingTx.wait();
          
          // Verify the new balance
          const newBalance = await provider.getBalance(testatorWallet.address);
          console.log(`New testator wallet balance: ${ethers.formatEther(newBalance)} ETH`);
          
          if (newBalance < gasCost) {
            throw new Error('Testator wallet still has insufficient funds after transfer');
          }
        } catch (error) {
          // Check if it's an insufficient funds error
          if (error.message.includes('insufficient funds')) {
            // This is already handled above with better error message
            throw new Error('Operation cancelled due to insufficient funds');
          } else {
            console.error(`\n⚠️ ERROR: Failed to transfer funds: ${error.message}`);
            throw new Error('Fund transfer failed');
          }
        }
      } else {
        throw new Error('Check-in cancelled: testator wallet needs ETH for gas');
      }
    }
    
    // Now perform the check-in with the funded testator wallet
    console.log(`\nPerforming check-in...`);
    const tx = await testatorContract.checkIn(0, {
      gasLimit: gasBuffer
    });
    
    console.log(`Transaction sent: ${tx.hash}`);
    console.log('Waiting for transaction confirmation...');
    
    // Wait for confirmation with timeout
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
    console.log('Check-in successful!');
  } catch (error) {
    // Provide a user-friendly error message
    if (error.message.includes('insufficient funds')) {
      console.error(`\n⚠️ ERROR: Operation cancelled due to insufficient funds in gas wallet.`);
      console.log(`Please add more ETH to your gas wallet address and try again.`);
    } else if (error.message.includes('Fund transfer failed')) {
      console.error(`\n⚠️ ERROR: Unable to transfer funds to testator wallet.`);
    } else if (error.message.includes('Testator wallet still has insufficient funds')) {
      console.error(`\n⚠️ ERROR: Transfer completed but testator wallet still has insufficient funds.`);
      console.log(`This can happen due to gas price fluctuations. Please try again with a larger amount.`);
    } else {
      console.error(`\n⚠️ ERROR during check-in: ${error.message}`);
    }
  }
}

/**
 * Removes the verifier for a testator
 * Clears all verification requirements by setting verifier to zero address
 *
 * @param {Object} testatorKeys - Object containing {address: string, privateKey: string, publicKey: string}
 * @param {ethers.Wallet} signer - Gas wallet signer for funding operations
 * @param {ethers.Provider} provider - Network provider (JsonRpcProvider)
 * @param {string} contractAddress - Contract address (0x...)
 */
async function removeVerifier(testatorKeys, signer, provider, contractAddress) {
  try {
    console.log('\n=== Remove Verifier ===');
    
    // Confirm with user
    const confirmation = await question('\nThis will remove your verifier. All verification requirements will be cleared.\nProceed? (yes/no): ');
    if (confirmation.toLowerCase() !== 'yes') {
      console.log('Operation cancelled.');
      return;
    }

    // Create testator wallet - using the same pattern as in performCheckIn
    // Notice we're using testatorKeys.privateKey which is already properly formatted
    const testatorWallet = new ethers.Wallet(testatorKeys.privateKey, provider);
    console.log(`Using testator wallet: ${testatorWallet.address}`);
    
    // Create contract instance with testator wallet - like in performCheckIn
    const testatorContract = new ethers.Contract(contractAddress, CONTRACT_ABIS.INHERITOR_ABI, testatorWallet);
    
    // Get current verifier - using our testatorContract
    console.log('\nChecking current verifier...');
    let currentVerifier;
    try {
      // This is a view function that doesn't require gas
      currentVerifier = await testatorContract.testatorVerifier(testatorWallet.address);
      if (currentVerifier === '0x0000000000000000000000000000000000000000') {
        console.log('You currently have no verifier set.');
        const continueAnyway = await question('Continue anyway? (yes/no): ');
        if (continueAnyway.toLowerCase() !== 'yes') {
          return;
        }
      } else {
        console.log(`Current verifier: ${currentVerifier}`);
      }
    } catch (error) {
      console.log(`Could not retrieve current verifier: ${error.message}`);
      console.log('Continuing anyway...');
    }
    
    // Check testator wallet balance
    const testatorBalance = await provider.getBalance(testatorWallet.address);
    console.log(`\nTestator wallet balance: ${ethers.formatEther(testatorBalance)} ETH`);
    
    // Estimate gas for the updateVerifier function
    console.log('\nEstimating gas for removing verifier...');
    let estimatedGas;
    try {
      estimatedGas = await testatorContract.updateVerifier.estimateGas(
        '0x0000000000000000000000000000000000000000',  // Zero address to clear verifier
        0                                               // Zero verification delay
      );
      // Add buffer
      estimatedGas = BigInt(Math.floor(Number(estimatedGas) * 1.2)); // 20% buffer
    } catch (error) {
      console.log(`Could not estimate gas: ${error.message}`);
      estimatedGas = BigInt(100000); // Fallback gas limit
      console.log(`Using fallback gas limit of ${estimatedGas}`);
    }
    
    // Get current gas price
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice;
    const gasCost = gasPrice * estimatedGas;
    
    console.log(`Estimated gas cost: ${ethers.formatEther(gasCost)} ETH`);
    
    // Check if testator needs funding - using 3x multiplier for safe buffer
    if (testatorBalance < gasCost * BigInt(3)) {
      console.log(`\nTestator wallet needs funding for gas`);
      
      // Ask if user wants to fund the testator wallet
      const fundConfirmation = await question(`Do you want to transfer ${ethers.formatEther(gasCost * BigInt(5))} ETH from gas wallet to testator wallet? (yes/no): `);
      
      if (fundConfirmation.toLowerCase() === 'yes') {
        try {
          console.log(`\nTransferring funds to testator wallet...`);
          
          // Get gas wallet balance
          const gasWalletBalance = await provider.getBalance(signer.address);
          console.log(`Gas wallet balance: ${ethers.formatEther(gasWalletBalance)} ETH`);
          
          // Check if gas wallet has enough funds
          const transferAmount = gasCost * BigInt(5); // 5x buffer
          if (gasWalletBalance < transferAmount) {
            console.error(`\n⚠️ ERROR: Gas wallet has insufficient funds`);
            console.log(`Required: ${ethers.formatEther(transferAmount)} ETH`);
            console.log(`Available: ${ethers.formatEther(gasWalletBalance)} ETH`);
            throw new Error('Insufficient funds in gas wallet');
          }
          
          // Transfer more than the estimated gas cost to be safe
          const fundingTx = await signer.sendTransaction({
            to: testatorWallet.address,
            value: transferAmount
          });
          
          console.log(`Funding transaction sent: ${fundingTx.hash}`);
          console.log(`Waiting for transaction confirmation...`);
          await fundingTx.wait();
          
          // Verify the new balance
          const newBalance = await provider.getBalance(testatorWallet.address);
          console.log(`New testator wallet balance: ${ethers.formatEther(newBalance)} ETH`);
          
          if (newBalance < gasCost) {
            throw new Error('Testator wallet still has insufficient funds after transfer');
          }
        } catch (error) {
          console.error(`\n⚠️ ERROR: Failed to transfer funds: ${error.message}`);
          throw new Error('Fund transfer failed');
        }
      } else {
        throw new Error('Operation cancelled: testator wallet needs ETH for gas');
      }
    }
    
    // Now call updateVerifier with zero address and zero delay
    console.log('\nRemoving verifier...');
    
    const tx = await testatorContract.updateVerifier(
      '0x0000000000000000000000000000000000000000',  // Zero address to clear verifier
      0,                                              // Zero verification delay
      {
        gasLimit: estimatedGas
      }
    );
    
    console.log(`Transaction sent: ${tx.hash}`);
    console.log('Waiting for confirmation...');
    
    await tx.wait();
    console.log('\n✅ Verifier has been successfully removed!');
    
  } catch (error) {
    if (error.message.includes('insufficient funds')) {
      console.error(`\n⚠️ ERROR: Operation cancelled due to insufficient funds.`);
    } else if (error.message.includes('Fund transfer failed')) {
      console.error(`\n⚠️ ERROR: Unable to transfer funds to testator wallet.`);
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
  console.log('=== Inheritor Emergency Management Tool ===');
  console.log('This tool allows you to manage your digital inheritances in emergency situations.');
  console.log('');
  
  try {
    // Load testator keys from exported JSON file
    let testatorKeys;
    try {
      testatorKeys = loadTestatorKeysFromFile();
      console.log(`Testator address: ${testatorKeys.address}`);
    } catch (keyError) {
      console.error('\n⚠️  Key Loading Error:');
      console.error(keyError.message);
      console.log('\nPlease ensure that:');
      console.log('1. You have exported your keys from the iOS Inheritor app');
      console.log('2. The exported JSON file is placed in the ./keys/ directory');
      console.log('3. The file is named in the format: InheritorKeys_YYYY-MM-DD.json');
      throw new Error('Failed to load testator keys');
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
    
    // Create testator wallet with provider
    const testatorWallet = new ethers.Wallet(testatorKeys.privateKey, provider);
    
    // Main menu loop
    let running = true;
    while (running) {
      console.log('\n=== Main Menu ===');
      const action = await question(
        '1. View Digital Will\n' +
        '2. Revoke all inheritances\n' +
        '3. Check-in\n' +
        '4. Remove verifier\n' +
        '5. Fund testator wallet\n' +
        '6. Refund remaining ETH to gas wallet\n' +
        '7. Exit\n' +
        'Choose an action (1-7): '
      );
      
      switch (action) {
        case '1':
          // View Digital Will
          await viewDigitalWill(contract, testatorWallet.address);
          break;
          
        case '2':
          // Revoke all inheritances
          await revokeAllInheritances(contract, testatorKeys, signer, provider, contractAddress);
          break;
          
        case '3':
          // Check-in
          await performCheckIn(testatorKeys, signer, provider, contractAddress);
          break;

        case '4':
          // Remove verifier (new option)
          await removeVerifier(testatorKeys, signer, provider, contractAddress);
          break;
          
        case '5':
          // Fund testator wallet
          await walletUtils.fundWallet(testatorKeys, signer, provider, "Testator", question);
          break;

        case '6':
          // Refund remaining ETH
          await walletUtils.refundWallet(testatorKeys, gasWallet.address, provider, "Testator", question);
          break;

        case '7':
          // Exit
          console.log('Exiting...');
          running = false;
          break;

        default:
          console.log('Invalid choice. Please select 1-7.');
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