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
const fs = require('fs');
const path = require('path');

// =============================================================================
// Configuration Constants
// =============================================================================

// Contract & Network Settings
const PROXY_CONTRACT_ADDRESS = '0x81DA9Fc682d1F8Baf80ebCCe64122A6688E4F37A'; // Only on Ethereum
const ETHEREUM_CHAIN_ID = 1;
const ARBITRUM_CHAIN_ID = 42161;

// ABI Fragments for the contracts
const PROXY_ABI = [
  'function getContractAddress(uint256 chainId) external view returns (address)'
];

const INHERITOR_ABI = [
  'function inheritances(bytes32 inheritanceId) public view returns (address testatorEOA, address testatorSAA, address beneficiaryEOA, address beneficiarySAA, uint256 gracePeriod, uint8 state, bytes32 arweaveTransactionId, uint256 scheduledTransferTime)',
  'function digitalWill(address testatorEOA, uint256 index) public view returns (bytes32)',
  'function digitalWill(address) public view returns (bytes32[])',
  'function testatorLastCheckIn(address) public view returns (uint256)',
  'function checkInInterval(address) public view returns (uint256)',
  'function revokeInheritance(bytes32 inheritanceId) external',
  'function checkIn(uint256 newInterval) public',
  'function testatorVerifier(address) external view returns (address)',
  'function updateVerifier(address verifier, uint256 verificationDelay) external',
  'event AddInheritance(bytes32 indexed inheritanceId, address indexed testatorEOA, address indexed beneficiaryEOA)'
];

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Network configurations with fallback RPC endpoints
const NETWORK_CONFIGS = {
  ethereum: {
    name: 'Ethereum Mainnet',
    chainId: ETHEREUM_CHAIN_ID,
    publicFallbacks: [
      'https://eth.llamarpc.com',
      'https://rpc.ankr.com/eth',
      'https://cloudflare-eth.com'
    ]
  },
  arbitrum: {
    name: 'Arbitrum One',
    chainId: ARBITRUM_CHAIN_ID,
    publicFallbacks: [
      'https://arb1.arbitrum.io/rpc',
      'https://rpc.ankr.com/arbitrum',
      'https://arbitrum-one.publicnode.com'
    ]
  }
};

// Inheritance state constants
const INHERITANCE_STATES = {
  DESIGNATED: 0,
  CLAIMABLE: 1,
  CLAIMED: 2,
  REVOKED: 3,
  PURGED: 4
};

// State enum from the contract with readable names and ANSI colors
// Colors match the iOS implementation:
// - Designated: green
// - Claimable: orange/yellow (using yellow for better visibility in terminal)
// - Claimed: blue
// - Revoked: red
// - Purged: gray
const STATE_NAMES = {
  [INHERITANCE_STATES.DESIGNATED]: '\x1b[32mDesignated\x1b[0m',   // Green
  [INHERITANCE_STATES.CLAIMABLE]: '\x1b[33mClaimable\x1b[0m',    // Yellow (for orange)
  [INHERITANCE_STATES.CLAIMED]: '\x1b[34mClaimed\x1b[0m',      // Blue
  [INHERITANCE_STATES.REVOKED]: '\x1b[31mRevoked\x1b[0m',      // Red
  [INHERITANCE_STATES.PURGED]: '\x1b[90mPurged\x1b[0m'        // Gray
};

// Gas estimation and funding constants
const GAS_CONSTANTS = {
  SAFETY_MULTIPLIER: 5,           // 5x multiplier for gas estimates
  FUNDING_MULTIPLIER: 10,         // 10x multiplier for funding amounts
  REFUND_BUFFER_MULTIPLIER: 1.2,  // 20% buffer for refunds
  FALLBACK_GAS_AMOUNT: "0.001",   // Fallback gas estimate in ETH
  MIN_REFUNDABLE_AMOUNT: "0.001", // Minimum amount worth refunding
  STANDARD_TRANSFER_GAS: 21000    // Standard ETH transfer gas limit
};

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

/**
 * Load testator keys from exported JSON key file
 * @returns {Object} Object containing address, privateKey, and publicKey
 */
function loadTestatorKeysFromFile() {
  const keysDir = path.join(__dirname, '..', 'keys');

  // Check if keys directory exists
  if (!fs.existsSync(keysDir)) {
    throw new Error(`Keys directory not found at ${keysDir}. Please create the directory and place your exported key file there.`);
  }

  // Find InheritorKeys_*.json files
  const files = fs.readdirSync(keysDir).filter(file =>
    file.startsWith('InheritorKeys_') && file.endsWith('.json')
  );

  if (files.length === 0) {
    throw new Error(`No InheritorKeys_*.json files found in ${keysDir}. Please export your keys from the iOS app and place the file there.`);
  }

  // Use the most recent file (lexicographically, which works for YYYY-MM-DD format)
  const keyFile = files.sort().reverse()[0];
  const keyFilePath = path.join(keysDir, keyFile);

  console.log(`Loading keys from: ${keyFile}`);

  try {
    // Read and parse the JSON file
    const keyFileContent = fs.readFileSync(keyFilePath, 'utf8');
    const keyData = JSON.parse(keyFileContent);

    // Validate the JSON structure
    if (!keyData.testator || !keyData.testator.ethereum) {
      throw new Error('Invalid key file format: missing testator.ethereum section');
    }

    const testatorEthKeys = keyData.testator.ethereum;

    // Validate required fields
    if (!testatorEthKeys.address || !testatorEthKeys.privateKey) {
      throw new Error('Invalid key file format: missing address or privateKey');
    }

    // Validate address format
    if (!ethers.isAddress(testatorEthKeys.address)) {
      throw new Error('Invalid address format in key file');
    }

    // Normalize private key format (add 0x prefix if missing)
    let privateKey = testatorEthKeys.privateKey;
    if (!privateKey.startsWith('0x')) {
      privateKey = '0x' + privateKey;
    }

    // Validate private key format (should be 66 characters with 0x prefix, or 64 without)
    if (privateKey.length !== 66 || !privateKey.startsWith('0x')) {
      throw new Error('Invalid private key format in key file (must be 64 hex characters, with or without 0x prefix)');
    }

    // Verify the private key matches the address
    const wallet = new ethers.Wallet(privateKey);
    if (wallet.address.toLowerCase() !== testatorEthKeys.address.toLowerCase()) {
      throw new Error('Private key does not match address in key file');
    }

    return {
      address: testatorEthKeys.address,
      privateKey: privateKey, // Return normalized private key with 0x prefix
      publicKey: wallet.publicKey
    };

  } catch (error) {
    if (error.message.includes('JSON')) {
      throw new Error(`Failed to parse key file: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Format duration in seconds to a readable string
 * @param {number|bigint} seconds Time duration in seconds
 * @returns {string} Formatted duration string
 */
function formatDuration(seconds) {
  // Convert BigInt to Number if needed
  const secs = typeof seconds === 'bigint' ? Number(seconds) : Number(seconds);
  
  if (secs < 60) return `${secs} seconds`;
  if (secs < 3600) return `${Math.floor(secs / 60)} minutes`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hours`;
  return `${Math.floor(secs / 86400)} days`;
}

/**
 * Format timestamp to a readable date and time
 * @param {number|bigint} timestamp Unix timestamp in seconds
 * @returns {string} Formatted date and time
 */
function formatTimestamp(timestamp) {
  // Convert BigInt to Number if needed
  const ts = typeof timestamp === 'bigint' ? Number(timestamp) : Number(timestamp);
  return new Date(ts * 1000).toLocaleString();
}

/**
 * Ensures a wallet has sufficient funds for operations, transferring from gas wallet if needed
 * @param {Object} walletKeys - Object containing {address, privateKey, publicKey}
 * @param {ethers.Wallet} gasWallet - Gas wallet for funding transfers
 * @param {ethers.Provider} provider - Network provider
 * @param {bigint} requiredAmount - Required amount in wei
 * @param {string} operationName - Name of operation for user messages
 * @returns {Promise<ethers.Wallet>} Funded wallet instance
 */
async function ensureWalletFunding(walletKeys, gasWallet, provider, requiredAmount, operationName) {
  // Create wallet instance
  const wallet = new ethers.Wallet(walletKeys.privateKey, provider);

  // Check current balance
  const currentBalance = await provider.getBalance(wallet.address);
  console.log(`${operationName} wallet balance: ${ethers.formatEther(currentBalance)} ETH`);

  // Check if funding is needed
  if (currentBalance >= requiredAmount) {
    return wallet; // Already has sufficient funds
  }

  console.log(`\n${operationName} wallet needs funding for gas.`);

  // Calculate funding amount with safety buffer
  const fundAmount = requiredAmount * BigInt(GAS_CONSTANTS.FUNDING_MULTIPLIER);

  const fundConfirmation = await question(
    `Do you want to transfer ${ethers.formatEther(fundAmount)} ETH from gas wallet to ${operationName.toLowerCase()} wallet? (yes/no): `
  );

  if (fundConfirmation.toLowerCase() !== 'yes') {
    throw new Error(`${operationName} cancelled: wallet needs ETH for gas`);
  }

  // Check gas wallet balance
  const gasWalletBalance = await provider.getBalance(gasWallet.address);
  console.log(`Gas wallet balance: ${ethers.formatEther(gasWalletBalance)} ETH`);

  if (gasWalletBalance < fundAmount) {
    console.error(`\n⚠️ ERROR: Gas wallet has insufficient funds`);
    console.log(`Required: ${ethers.formatEther(fundAmount)} ETH`);
    console.log(`Available: ${ethers.formatEther(gasWalletBalance)} ETH`);
    console.log(`\nPlease fund your gas wallet with at least ${ethers.formatEther(fundAmount - gasWalletBalance)} more ETH to continue.`);
    throw new Error('Insufficient funds in gas wallet');
  }

  // Transfer funds
  console.log(`\nTransferring funds to ${operationName.toLowerCase()} wallet...`);
  const fundingTx = await gasWallet.sendTransaction({
    to: wallet.address,
    value: fundAmount
  });

  console.log(`Funding transaction sent: ${fundingTx.hash}`);
  console.log(`Waiting for transaction confirmation...`);
  await fundingTx.wait();

  // Verify the new balance
  const newBalance = await provider.getBalance(wallet.address);
  console.log(`New ${operationName.toLowerCase()} wallet balance: ${ethers.formatEther(newBalance)} ETH`);

  if (newBalance < requiredAmount) {
    throw new Error(`${operationName} wallet still has insufficient funds after transfer`);
  }

  return wallet;
}

// =============================================================================
// Blockchain & Network Functions
// =============================================================================

/**
 * Set up an Ethereum provider with retry logic
 * Attempts to connect to user-specified or public RPC endpoints
 * 
 * @param {Object} networkConfig Network configuration object
 * @returns {Promise<JsonRpcProvider>} Connected provider
 */
async function setupProvider(networkConfig) {
  console.log('\nRPC Configuration:');
  console.log('1. Enter custom RPC URL (recommended: Infura, Alchemy, etc.)');
  console.log('2. Use public RPC endpoints (may be less reliable)');
  const rpcChoice = await question('Your choice (1-2): ');
  
  let rpcUrl;
  if (rpcChoice === '1') {
    rpcUrl = await question(`Enter RPC URL for ${networkConfig.name}: `);
  } else {
    console.log('Trying public RPC endpoints...');
    rpcUrl = networkConfig.publicFallbacks[0];
    console.log(`Using: ${rpcUrl}`);
  }
  
  // Set up provider with retry logic
  let provider;
  let attempts = 0;
  let connected = false;
  
  while (!connected && attempts < 3) {
    try {
      console.log(`Connecting to ${rpcUrl}...`);
      provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Test the connection
      await provider.getBlockNumber();
      connected = true;
      console.log('Connection successful!');
    } catch (error) {
      attempts++;
      console.log(`Connection failed: ${error.message}`);
      
      if (attempts < 3 && networkConfig.publicFallbacks.length > attempts) {
        rpcUrl = networkConfig.publicFallbacks[attempts];
        console.log(`Trying alternative endpoint: ${rpcUrl}`);
      } else if (attempts >= 3) {
        throw new Error('Failed to connect to any RPC endpoint. Please try again with a custom URL from Infura or Alchemy.');
      }
    }
  }
  
  // Verify we're connected to the chosen network
  const network = await provider.getNetwork();
  console.log(`Connected to network: ${network.name} (Chain ID: ${network.chainId})`);
  
  if (network.chainId !== BigInt(networkConfig.chainId)) {
    throw new Error(`Provider connected to wrong network. Expected chain ID ${networkConfig.chainId}, got ${network.chainId}`);
  }
  
  return provider;
}

/**
 * Get contract address from Ethereum proxy for any chain
 * @param {JsonRpcProvider} provider Ethereum provider
 * @param {number} targetChainId Target chain ID
 * @returns {Promise<string>} Contract address
 */
async function getContractAddressFromProxy(provider, targetChainId) {
  console.log(`Retrieving ${targetChainId === ETHEREUM_CHAIN_ID ? 'Ethereum' : 'Arbitrum'} contract address from proxy...`);
  
  // First ensure we're connected to Ethereum where the proxy is deployed
  const network = await provider.getNetwork();
  const isEthereumProvider = network.chainId === BigInt(ETHEREUM_CHAIN_ID);
  
  if (!isEthereumProvider) {
    throw new Error("Must use an Ethereum provider to access the proxy contract");
  }
  
  // Check if proxy contract exists at the address
  const code = await provider.getCode(PROXY_CONTRACT_ADDRESS);
  if (code === '0x') {
    throw new Error(`No contract found at proxy address ${PROXY_CONTRACT_ADDRESS}`);
  }
  
  const proxyContract = new ethers.Contract(
    PROXY_CONTRACT_ADDRESS,
    PROXY_ABI,
    provider
  );
  
  const contractAddress = await proxyContract.getContractAddress(targetChainId);
  
  // Check if the contract is in maintenance mode (address is 0x0)
  if (contractAddress === '0x0000000000000000000000000000000000000000') {
    throw new Error(`Contract on chain ID ${targetChainId} is currently in maintenance mode.`);
  }
  
  return contractAddress;
}

/**
 * Get contract address for network
 * @param {JsonRpcProvider} provider Provider for the network
 * @param {Object} networkConfig Network configuration
 * @returns {Promise<string>} Contract address
 */
async function getContractAddressForNetwork(provider, networkConfig) {
  let contractAddress;
  let ethProvider;
  
  try {
    // If we're already on Ethereum, use the current provider
    if (networkConfig.chainId === ETHEREUM_CHAIN_ID) {
      ethProvider = provider;
    } else {
      // If we're on Arbitrum, we need a separate Ethereum provider to query the proxy
      console.log('\nCreating separate Ethereum connection to query proxy contract...');
      
      // Try to use a public Ethereum endpoint
      for (const rpcUrl of NETWORK_CONFIGS.ethereum.publicFallbacks) {
        try {
          ethProvider = new ethers.JsonRpcProvider(rpcUrl);
          // Test the connection
          await ethProvider.getBlockNumber();
          console.log(`Connected to Ethereum via ${rpcUrl}`);
          break;
        } catch (error) {
          console.log(`Failed to connect to Ethereum via ${rpcUrl}: ${error.message}`);
        }
      }
      
      // If we couldn't connect to any public endpoint
      if (!ethProvider) {
        console.log('\nFailed to connect to any public Ethereum endpoint.');
        const ethRpcUrl = await question('Please enter an Ethereum RPC URL: ');
        ethProvider = new ethers.JsonRpcProvider(ethRpcUrl);
        
        // Test the connection
        try {
          await ethProvider.getBlockNumber();
          console.log('Connected to Ethereum successfully!');
        } catch (error) {
          throw new Error(`Failed to connect to Ethereum: ${error.message}`);
        }
      }
    }
    
    // Now that we have an Ethereum provider, query the proxy contract
    contractAddress = await getContractAddressFromProxy(ethProvider, networkConfig.chainId);
    console.log(`Contract address for ${networkConfig.name}: ${contractAddress}`);
    
  } catch (error) {
    console.error(`\nError getting contract address from proxy: ${error.message}`);
    console.log('Falling back to manual entry mode.');
    contractAddress = await question(`Please enter the Inheritor contract address for ${networkConfig.name}: `);
    if (!ethers.isAddress(contractAddress)) {
      throw new Error('Invalid contract address format');
    }
  }
  
  return contractAddress;
}

// =============================================================================
// Inheritance Query Functions
// =============================================================================

/**
 * Get all inheritances for a testator using event logs
 * @param {ethers.Contract} contract Inheritor contract
 * @param {string} testatorAddress Testator's address
 * @returns {Promise<Array<string>>} Array of inheritance IDs
 */
async function getTestatorInheritances(contract, testatorAddress) {
  console.log(`Searching for inheritances via events for ${testatorAddress}...`);
  
  try {
    // Create a filter for AddInheritance events where testatorEOA is our address
    const filter = contract.filters.AddInheritance(null, testatorAddress, null);
    
    // Query all matching events
    console.log('Fetching event logs...');
    const events = await contract.queryFilter(filter);
    
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
 * View Digital Will function
 * Fetches and displays all inheritances and check-in information
 *
 * @param {ethers.Contract} contract - Inheritor contract instance
 * @param {string} testatorAddress - Testator's Ethereum address (0x...)
 */
async function viewDigitalWill(contract, testatorAddress) {
  console.log(`\nFetching digital will information for ${testatorAddress}...`);
  
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
    
    // Always get fresh inheritance data from blockchain
    const inheritanceIds = await getTestatorInheritances(contract, testatorKeys.address);
    
    if (inheritanceIds.length === 0) {
      console.log('No inheritances found to revoke.');
      return;
    }
    
    // Get details for each inheritance
    const inheritances = [];
    for (const id of inheritanceIds) {
      const details = await getInheritanceDetails(contract, id);
      inheritances.push(details);
    }
    
    // Create testator wallet for signing revocation transactions
    const testatorWallet = new ethers.Wallet(testatorKeys.privateKey, provider);
    console.log(`Using testator wallet: ${testatorWallet.address}`);
    
    // Create a contract instance with the testator's wallet
    const testatorContract = new ethers.Contract(contractAddress, INHERITOR_ABI, testatorWallet);
    
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
      // Skip those that are Claimable, Claimed, Revoked, or Purged
      if (inheritance.state === INHERITANCE_STATES.DESIGNATED) {
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
    const testatorContract = new ethers.Contract(contractAddress, INHERITOR_ABI, testatorWallet);
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
    const testatorContract = new ethers.Contract(contractAddress, INHERITOR_ABI, testatorWallet);
    
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

/**
 * Refund remaining ETH to gas wallet
 * Transfers unused ETH from the testator wallet back to the gas wallet
 *
 * @param {Object} testatorKeys - Object containing {address: string, privateKey: string, publicKey: string}
 * @param {string} gasWalletAddress - Gas wallet Ethereum address (0x...)
 * @param {ethers.Provider} provider - Network provider (JsonRpcProvider)
 */
async function refundRemainingEth(testatorKeys, gasWalletAddress, provider) {
  try {
    // Create testator wallet
    const testatorWallet = new ethers.Wallet(testatorKeys.privateKey, provider);
    
    // Get current balance
    const balance = await provider.getBalance(testatorWallet.address);
    console.log(`\nTestator wallet (${testatorWallet.address}) balance: ${ethers.formatEther(balance)} ETH`);
    
    // Define minimum refundable amount
    const minimumRefundable = ethers.parseEther(GAS_CONSTANTS.MIN_REFUNDABLE_AMOUNT);
    
    if (balance <= 0) {
      console.log('No funds to refund.');
      return;
    }
    
    if (balance < minimumRefundable) {
      console.log(`Balance too low to refund reliably (less than 0.001 ETH).`);
      console.log(`For very small amounts, the gas cost approaches or exceeds the refund value.`);
      console.log(`Consider this amount (${ethers.formatEther(balance)} ETH) as network operation cost.`);
      return;
    }
    
    const confirmation = await question(`Do you want to refund ${ethers.formatEther(balance)} ETH to gas wallet (${gasWalletAddress})? (yes/no): `);
    
    if (confirmation.toLowerCase() !== 'yes') {
      console.log('Refund cancelled.');
      return;
    }
    
    // We need to leave some ETH for gas
    const gasPrice = (await provider.getFeeData()).gasPrice;
    const gasLimit = BigInt(GAS_CONSTANTS.STANDARD_TRANSFER_GAS);
    const gasCost = gasPrice * gasLimit;
    
    console.log(`Estimated gas cost: ${ethers.formatEther(gasCost)} ETH`);
    
    if (balance <= gasCost) {
      console.log('Balance too low to cover gas costs. Cannot refund.');
      return;
    }
    
    // Calculate refund amount (leave some buffer for gas price fluctuations)
    const buffer = gasCost * BigInt(Math.floor(GAS_CONSTANTS.REFUND_BUFFER_MULTIPLIER * 10)) / BigInt(10);
    const refundAmount = balance - buffer;
    
    console.log(`\nSending ${ethers.formatEther(refundAmount)} ETH back to gas wallet...`);
    console.log(`(Keeping ${ethers.formatEther(buffer)} ETH for gas)`);
    
    const tx = await testatorWallet.sendTransaction({
      to: gasWalletAddress,
      value: refundAmount,
      gasLimit: gasLimit
    });
    
    console.log(`Refund transaction sent: ${tx.hash}`);
    console.log('Waiting for confirmation...');
    
    await tx.wait();
    
    // Check new balances
    const newTestatorBalance = await provider.getBalance(testatorWallet.address);
    const newGasWalletBalance = await provider.getBalance(gasWalletAddress);
    
    console.log(`\nRefund complete!`);
    console.log(`New testator wallet balance: ${ethers.formatEther(newTestatorBalance)} ETH`);
    console.log(`New gas wallet balance: ${ethers.formatEther(newGasWalletBalance)} ETH`);
    
  } catch (error) {
    console.error(`\n⚠️ ERROR during refund: ${error.message}`);
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
    const networkChoice = await question('Select network (ethereum/arbitrum): ');
    if (!['ethereum', 'arbitrum'].includes(networkChoice.toLowerCase())) {
      throw new Error('Invalid network selection. Please choose "ethereum" or "arbitrum".');
    }
    
    const networkConfig = NETWORK_CONFIGS[networkChoice.toLowerCase()];
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
    const contract = new ethers.Contract(contractAddress, INHERITOR_ABI, signer);
    
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
        '5. Refund remaining ETH to gas wallet\n' +
        '6. Exit\n' +
        'Choose an action (1-6): ' 
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
          // Refund remaining ETH
          await refundRemainingEth(testatorKeys, gasWallet.address, provider);
          break;
          
        case '6':
          // Exit
          console.log('Exiting...');
          running = false;
          break;
          
        default:
          console.log('Invalid choice. Please select 1-6.');  // Update the range
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