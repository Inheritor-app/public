#!/usr/bin/env node

/**
 * Inheritor Beneficiary Check Tool
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
  'function isClaimable(bytes32 inheritanceId) public returns (bool)',
  'function getBeneficiaryInheritances(address beneficiaryEOA) external view returns (bytes32[] memory)',  // Add this line
  'event AddInheritance(bytes32 indexed inheritanceId, address indexed testatorEOA, address indexed beneficiaryEOA)'
];

// Create readline interface for user input
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

// State enum from the contract with readable names and color formatting
const STATE_NAMES = {
  [INHERITANCE_STATES.DESIGNATED]: '\x1b[32mDesignated\x1b[0m',   // Green
  [INHERITANCE_STATES.CLAIMABLE]: '\x1b[33mClaimable\x1b[0m',    // Yellow (for orange)
  [INHERITANCE_STATES.CLAIMED]: '\x1b[34mClaimed\x1b[0m',      // Blue
  [INHERITANCE_STATES.REVOKED]: '\x1b[31mRevoked\x1b[0m',      // Red
  [INHERITANCE_STATES.PURGED]: '\x1b[90mPurged\x1b[0m'        // Gray
};

// Gas estimation and funding constants
const GAS_CONSTANTS = {
  SAFETY_MULTIPLIER: 1.2,         // 20% buffer for gas estimates
  FUNDING_MULTIPLIER: 2,          // 2x multiplier for funding amounts
  REFUND_BUFFER_MULTIPLIER: 1.2,  // 20% buffer for refunds
  FALLBACK_GAS_LIMIT: 100000,     // Fallback gas limit
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
 * Load beneficiary keys from exported JSON key file
 * @returns {Object} Object containing address, privateKey, and publicKey
 */
function loadBeneficiaryKeysFromFile() {
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
    if (!keyData.beneficiary || !keyData.beneficiary.ethereum) {
      throw new Error('Invalid key file format: missing beneficiary.ethereum section');
    }

    const beneficiaryEthKeys = keyData.beneficiary.ethereum;

    // Validate required fields
    if (!beneficiaryEthKeys.address || !beneficiaryEthKeys.privateKey) {
      throw new Error('Invalid key file format: missing address or privateKey');
    }

    // Validate address format
    if (!ethers.isAddress(beneficiaryEthKeys.address)) {
      throw new Error('Invalid address format in key file');
    }

    // Normalize private key format (add 0x prefix if missing)
    let privateKey = beneficiaryEthKeys.privateKey;
    if (!privateKey.startsWith('0x')) {
      privateKey = '0x' + privateKey;
    }

    // Validate private key format (should be 66 characters with 0x prefix, or 64 without)
    if (privateKey.length !== 66 || !privateKey.startsWith('0x')) {
      throw new Error('Invalid private key format in key file (must be 64 hex characters, with or without 0x prefix)');
    }

    // Verify the private key matches the address
    const wallet = new ethers.Wallet(privateKey);
    if (wallet.address.toLowerCase() !== beneficiaryEthKeys.address.toLowerCase()) {
      throw new Error('Private key does not match address in key file');
    }

    return {
      address: beneficiaryEthKeys.address,
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
 * Format timestamp to a readable date and time
 * @param {number|BigInt} timestamp Unix timestamp in seconds
 * @returns {string} Formatted date and time
 */
function formatTimestamp(timestamp) {
  const ts = typeof timestamp === 'bigint' ? Number(timestamp) : Number(timestamp);
  return new Date(ts * 1000).toLocaleString();
}

/**
 * Ensures a wallet has sufficient funds for operations, transferring from gas wallet if needed
 * @param {Object} walletKeys - Object containing {address: string, privateKey: string, publicKey: string}
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
    scheduledTransferTime: inheritance.scheduledTransferTime.toString()
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
    
    console.log(`Found ${inheritanceIds.length} inheritance(s) in contract.`);
    return inheritanceIds;
  } catch (error) {
    console.error(`Error fetching inheritances from contract: ${error.message}`);
    throw error;
  }
}

/**
 * Display all inheritances for a beneficiary
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
    
    console.log('\n=== Your Inheritances ===');
    let index = 1;
    
    for (const inheritanceId of inheritanceIds) {
      try {
        // For each inheritance ID, fetch additional information
        const details = await getInheritanceDetails(contract, inheritanceId);

        // Only display if not revoked
        if (details.state !== INHERITANCE_STATES.REVOKED) {
          console.log(`\n${index}. Inheritance ID: ${inheritanceId}`);
          console.log(`   Testator: ${details.testatorEOA}`);
          console.log(`   State: ${details.stateName}`);

          // Only show scheduled transfer time if set
          if (BigInt(details.scheduledTransferTime) > 0n) {
            console.log(`   Scheduled Transfer: ${formatTimestamp(details.scheduledTransferTime)}`);
          }

          index++;
        }
      } catch (error) {
        console.log(`   Error fetching details for inheritance ${inheritanceId}: ${error.message}`);
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
    const beneficiaryContract = new ethers.Contract(contractAddress, INHERITOR_ABI, beneficiaryWallet);
    
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
    
    // Check if beneficiary needs funding
    if (beneficiaryBalance < gasCost) {
      console.log(`\nBeneficiary wallet needs funding for gas`);
      
      // Ask if user wants to fund the beneficiary wallet
      const fundConfirmation = await question(`Do you want to transfer ${ethers.formatEther(gasCost * BigInt(2))} ETH from gas wallet to beneficiary wallet? (yes/no): `);
      
      if (fundConfirmation.toLowerCase() === 'yes') {
        try {
          console.log(`\nTransferring funds to beneficiary wallet...`);
          
          // Get gas wallet balance
          const gasWalletBalance = await provider.getBalance(signer.address);
          console.log(`Gas wallet balance: ${ethers.formatEther(gasWalletBalance)} ETH`);
          
          // Check if gas wallet has enough funds
          const transferAmount = gasCost * BigInt(2);
          if (gasWalletBalance < transferAmount) {
            console.error(`\n⚠️ ERROR: Gas wallet has insufficient funds`);
            console.log(`Required: ${ethers.formatEther(transferAmount)} ETH`);
            console.log(`Available: ${ethers.formatEther(gasWalletBalance)} ETH`);
            throw new Error('Insufficient funds in gas wallet');
          }
          
          // Transfer double the estimated gas cost to be safe
          const fundingTx = await signer.sendTransaction({
            to: beneficiaryWallet.address,
            value: transferAmount
          });
          
          console.log(`Funding transaction sent: ${fundingTx.hash}`);
          console.log(`Waiting for transaction confirmation...`);
          await fundingTx.wait();
          
          // Verify the new balance
          const newBalance = await provider.getBalance(beneficiaryWallet.address);
          console.log(`New beneficiary wallet balance: ${ethers.formatEther(newBalance)} ETH`);
          
          if (newBalance < gasCost) {
            throw new Error('Beneficiary wallet still has insufficient funds after transfer');
          }
        } catch (error) {
          console.error(`\n⚠️ ERROR: Failed to transfer funds: ${error.message}`);
          throw new Error('Fund transfer failed');
        }
      } else {
        throw new Error('Check cancelled: beneficiary wallet needs ETH for gas');
      }
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
      console.log('- The testator has recently checked in');
      console.log('- The grace period has not expired');
      console.log('- Verification is required but not completed');
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

/**
 * Refund remaining ETH to gas wallet
 * Transfers unused ETH from the beneficiary wallet back to the gas wallet
 *
 * @param {Object} beneficiaryKeys - Object containing {address: string, privateKey: string, publicKey: string}
 * @param {string} gasWalletAddress - Gas wallet Ethereum address (0x...)
 * @param {ethers.Provider} provider - Network provider (JsonRpcProvider)
 */
async function refundRemainingEth(beneficiaryKeys, gasWalletAddress, provider) {
  try {
    // Create beneficiary wallet
    const beneficiaryWallet = new ethers.Wallet(beneficiaryKeys.privateKey, provider);
    
    // Get current balance
    const balance = await provider.getBalance(beneficiaryWallet.address);
    console.log(`\nBeneficiary wallet (${beneficiaryWallet.address}) balance: ${ethers.formatEther(balance)} ETH`);
    
    // Define minimum refundable amount
    const minimumRefundable = ethers.parseEther(GAS_CONSTANTS.MIN_REFUNDABLE_AMOUNT);
    
    if (balance <= 0) {
      console.log('No funds to refund.');
      return;
    }
    
    if (balance < minimumRefundable) {
      console.log(`Balance too low to refund reliably (less than 0.001 ETH).`);
      console.log(`For very small amounts, the gas cost approaches or exceeds the refund value.`);
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
    
    const tx = await beneficiaryWallet.sendTransaction({
      to: gasWalletAddress,
      value: refundAmount,
      gasLimit: gasLimit
    });
    
    console.log(`Refund transaction sent: ${tx.hash}`);
    console.log('Waiting for confirmation...');
    
    await tx.wait();
    
    // Check new balances
    const newBeneficiaryBalance = await provider.getBalance(beneficiaryWallet.address);
    const newGasWalletBalance = await provider.getBalance(gasWalletAddress);
    
    console.log(`\nRefund complete!`);
    console.log(`New beneficiary wallet balance: ${ethers.formatEther(newBeneficiaryBalance)} ETH`);
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
    
    // Main menu loop
    let running = true;
    while (running) {
      console.log('\n=== Main Menu ===');
      const action = await question(
        '1. Show received Inheritances\n' +
        '2. Check if inheritance is claimable\n' +
        '3. Refund remaining ETH to gas wallet\n' +
        '4. Exit\n' +
        'Choose an action (1-4): '
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
          // Refund remaining ETH
          await refundRemainingEth(beneficiaryKeys, signer.address, provider);
          break;
          
        case '4':
          // Exit
          console.log('Exiting...');
          running = false;
          break;
          
        default:
          console.log('Invalid choice. Please select 1-4.');
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