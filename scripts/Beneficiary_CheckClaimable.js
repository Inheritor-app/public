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

const { ethers } = require('ethers');
const bip39 = require('bip39');
const { HDNode } = require('@ethersproject/hdnode');
const readline = require('readline');
const axios = require('axios');

// =============================================================================
// Configuration Constants
// =============================================================================

// Contract & Network Settings
const PROXY_CONTRACT_ADDRESS = '0x1539421f1C4E7AE4CFDBc42F2723558D2fE407dF'; // Only on Ethereum
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

// State enum from the contract with readable names and color formatting
const STATE_NAMES = {
  0: '\x1b[32mDesignated\x1b[0m',   // Green
  1: '\x1b[33mClaimable\x1b[0m',    // Yellow (for orange)
  2: '\x1b[34mClaimed\x1b[0m',      // Blue
  3: '\x1b[31mRevoked\x1b[0m',      // Red
  4: '\x1b[90mPurged\x1b[0m'        // Gray
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
 * Derive Ethereum keys from a mnemonic phrase (BIP39 recovery phrase)
 * @param {string} mnemonic The recovery phrase (BIP39 mnemonic)
 * @returns {Object} Object containing address, privateKey, and publicKey
 */
function deriveKeysFromMnemonic(mnemonic) {
  // Validate mnemonic
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }
  
  // Convert mnemonic to seed
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  
  // Create HD wallet using the standard Ethereum path m/44'/60'/0'/0/0
  const hdNode = HDNode.fromSeed(seed);
  const wallet = hdNode.derivePath("m/44'/60'/0'/0/0");
  
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    publicKey: wallet.publicKey
  };
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
 * @param {ethers.Contract} contract Inheritor contract
 * @param {string} beneficiaryAddress Ethereum address of the beneficiary
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
        if (details.state !== 3) { // 3 = Revoked
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
 * @param {ethers.Contract} contract Inheritor contract
 * @param {Object} beneficiaryKeys The beneficiary's keys
 * @param {string} inheritanceId The inheritance ID to check
 * @param {ethers.Wallet} signer The gas wallet signer
 * @param {ethers.Provider} provider The network provider
 * @param {string} contractAddress The contract address
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
    if (inheritanceDetails.state === 1) { // 1 = Claimable
      console.log('\n✅ This inheritance is already CLAIMABLE!');
      return;
    } else if (inheritanceDetails.state === 2) { // 2 = Claimed
      console.log('\n🔵 This inheritance has already been CLAIMED!');
      return;
    } else if (inheritanceDetails.state === 3) { // 3 = Revoked
      console.log('\n🛑 This inheritance has been REVOKED by the testator.');
      return;
    } else if (inheritanceDetails.state === 4) { // 4 = Purged
      console.log('\n⚪ This inheritance has been PURGED from the system.');
      return;
    }
    
    // Estimate gas for isClaimable call
    console.log('\nEstimating gas for isClaimable call...');
    let estimatedGas;
    try {
      estimatedGas = await beneficiaryContract.isClaimable.estimateGas(inheritanceId);
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
    
    if (updatedDetails.state === 1) { // 1 = Claimable
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
 * @param {Object} beneficiaryKeys The beneficiary's keys
 * @param {string} gasWalletAddress The gas wallet address
 * @param {ethers.Provider} provider The network provider
 */
async function refundRemainingEth(beneficiaryKeys, gasWalletAddress, provider) {
  try {
    // Create beneficiary wallet
    const beneficiaryWallet = new ethers.Wallet(beneficiaryKeys.privateKey, provider);
    
    // Get current balance
    const balance = await provider.getBalance(beneficiaryWallet.address);
    console.log(`\nBeneficiary wallet (${beneficiaryWallet.address}) balance: ${ethers.formatEther(balance)} ETH`);
    
    // Define minimum refundable amount (0.001 ETH)
    const minimumRefundable = ethers.parseEther("0.001");
    
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
    const gasLimit = BigInt(21000); // Standard ETH transfer gas
    const gasCost = gasPrice * gasLimit;
    
    console.log(`Estimated gas cost: ${ethers.formatEther(gasCost)} ETH`);
    
    if (balance <= gasCost) {
      console.log('Balance too low to cover gas costs. Cannot refund.');
      return;
    }
    
    // Calculate refund amount (leave some buffer for gas price fluctuations)
    const buffer = gasCost * BigInt(12) / BigInt(10); // 20% buffer
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
    // Get beneficiary mnemonic and derive keys
    const beneficiaryMnemonic = await question('Enter beneficiary recovery phrase (mnemonic): ');
    const beneficiaryKeys = deriveKeysFromMnemonic(beneficiaryMnemonic);
    console.log(`Beneficiary address: ${beneficiaryKeys.address}`);
    
    // Get gas wallet private key
    const gasWalletKey = await question('Enter private key of wallet for gas payments: ');
    
    // Validate the gas wallet private key
    let gasWallet;
    try {
      gasWallet = new ethers.Wallet(gasWalletKey);
      console.log(`Gas wallet address: ${gasWallet.address}`);
    } catch (error) {
      throw new Error('Invalid private key for gas wallet');
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