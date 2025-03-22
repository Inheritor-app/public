#!/usr/bin/env node

/**
 * Inheritor Beneficiary Claim Tool
 * 
 * This script allows beneficiaries to claim their inheritances by:
 * 1. Retrieving the Arweave transaction ID from the smart contract
 * 2. Fetching the encrypted symmetric key from Cloudflare
 * 3. Decrypting the symmetric key using the beneficiary's private key
 * 4. Downloading the encrypted asset from Arweave
 * 5. Decrypting the asset using the symmetric key
 * 6. Saving the decrypted file to the current directory
 */

const { ethers } = require('ethers');
const bip39 = require('bip39');
const { HDNode } = require('@ethersproject/hdnode');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const secp256k1 = require('secp256k1');
const readline = require('readline');

// =============================================================================
// Configuration Constants
// =============================================================================

// Contract & Network Settings
const PROXY_CONTRACT_ADDRESS = '0x1539421f1C4E7AE4CFDBc42F2723558D2fE407dF'; // Ethereum proxy contract
const ETHEREUM_CHAIN_ID = 1;
const ARBITRUM_CHAIN_ID = 42161;
const CLOUDFLARE_WORKER_URL = 'https://keyprovider-prod.inheritor.workers.dev';

// ABI Fragments
const PROXY_ABI = [
  'function getContractAddress(uint256 chainId) external view returns (address)'
];

const INHERITOR_ABI = [
  'function inheritances(bytes32 inheritanceId) public view returns (address testatorEOA, address testatorSAA, address beneficiaryEOA, address beneficiarySAA, uint256 gracePeriod, uint8 state, bytes32 arweaveTransactionId, uint256 scheduledTransferTime)',
  'function isClaimable(bytes32 inheritanceId) public returns (bool)',
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

// Inheritance state names for better user feedback
const STATE_NAMES = {
  0: 'Designated',
  1: 'Claimable',
  2: 'Claimed',
  3: 'Revoked',
  4: 'Purged'
};

// =============================================================================
// Cryptographic Utilities
// =============================================================================

/**
 * Implements HKDF (RFC 5869) key derivation function
 * 
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

/**
 * Check if inheritance is claimable
 * @param {ethers.Contract} contract Inheritor contract
 * @param {string} inheritanceId Inheritance ID
 * @returns {Promise<boolean>} Whether inheritance is claimable
 */
async function isInheritanceClaimable(contract, inheritanceId) {
  console.log('Checking if inheritance is claimable...');
  
  try {
    const inheritance = await contract.inheritances(inheritanceId);
    
    const state = parseInt(inheritance.state);
    console.log(`Inheritance state: ${STATE_NAMES[state]} (${state})`);
    
    // State 1 is Claimable
    return state === 1;
  } catch (error) {
    console.error('Error checking if inheritance is claimable:', error.message);
    throw error;
  }
}

/**
 * Fetch Arweave transaction ID from smart contract
 * @param {ethers.Contract} contract Inheritor contract
 * @param {string} inheritanceId Inheritance ID
 * @returns {Promise<string>} Arweave transaction ID
 */
async function fetchArweaveTransactionId(contract, inheritanceId) {
  console.log('Fetching Arweave transaction ID from smart contract...');
  
  try {
    // First try the direct method if it exists
    try {
      const arweaveTransactionId = await contract.fetchArweaveTransactionId(inheritanceId);
      return ethers.hexlify(arweaveTransactionId);
    } catch (error) {
      console.log('Direct method not available, falling back to inheritance struct...');
    }
    
    // Fallback to getting it from the inheritance struct
    const inheritance = await contract.inheritances(inheritanceId);
    const arweaveTransactionId = inheritance.arweaveTransactionId;
    
    // Convert to hex string with 0x prefix
    const hexTransactionId = ethers.hexlify(arweaveTransactionId);
    
    return hexTransactionId;
  } catch (error) {
    console.error('Error fetching Arweave transaction ID:', error.message);
    throw error;
  }
}

// =============================================================================
// Cloudflare & Arweave Functions
// =============================================================================

/**
 * Retrieve encrypted symmetric key from Cloudflare
 * @param {string} inheritanceId Inheritance ID
 * @param {string} network Network name (ethereum or arbitrum)
 * @returns {Promise<string>} Encrypted symmetric key
 */
async function retrieveEncryptedSymmetricKey(inheritanceId, network) {
  console.log('Retrieving encrypted symmetric key from Cloudflare...');
  
  try {
    const url = `${CLOUDFLARE_WORKER_URL}/?inheritanceId=${inheritanceId}&network=${network}`;
    const response = await axios.get(url);
    
    if (response.status !== 200) {
      throw new Error(`Server responded with status code ${response.status}`);
    }
    
    if (!response.data.encryptedSymmetricKey) {
      throw new Error('Server did not return encrypted symmetric key. The inheritance may not be claimable.');
    }
    
    console.log(`Retrieved encrypted symmetric key (${response.data.encryptedSymmetricKey.length} chars)`);
    return response.data.encryptedSymmetricKey;
  } catch (error) {
    if (error.response) {
      console.error(`Server responded with error status: ${error.response.status}`);
      if (error.response.data && error.response.data.message) {
        throw new Error(`Server message: ${error.response.data.message}`);
      }
    }
    throw error;
  }
}

/**
 * Retrieve asset data from Arweave
 * @param {string} transactionId Arweave transaction ID (hex format with or without 0x prefix)
 * @returns {Promise<{data: Buffer, fileExtension: string}>} Asset data and file extension
 */
async function retrieveAssetFromArweave(transactionId) {
  // Remove 0x prefix if present
  const cleanHexId = transactionId.startsWith('0x') ? transactionId.slice(2) : transactionId;
  
  // Convert hex to base64url (Arweave's native format)
  // Step 1: Convert hex to bytes
  const bytes = Buffer.from(cleanHexId, 'hex');
  // Step 2: Convert bytes to base64
  const base64 = bytes.toString('base64');
  // Step 3: Convert base64 to base64url (replace + with -, / with _, and remove trailing =)
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  
  console.log(`Converted base64url transaction ID: ${base64url}`);
  
  // Try different formats
  const possibleIds = [
    cleanHexId,                    // Raw hex (no 0x prefix)
    base64url,                     // Base64URL encoded
    cleanHexId.replace(/^0+/, '')  // Hex with leading zeros removed
  ];
  
  // Try each possible format
  for (const id of possibleIds) {
    try {
      // First fetch the transaction data to get tags (including Content-Type)
      const transactionUrl = `https://arweave.net/tx/${id}`;
      
      try {
        const transactionResponse = await axios.get(transactionUrl);
        
        if (transactionResponse.status !== 200) {
          continue;
        }
        
        // Extract tags to find Content-Type
        const tags = transactionResponse.data.tags || [];
        let fileExtension = 'bin'; // Default extension
        
        for (const tag of tags) {
          const nameData = Buffer.from(tag.name, 'base64url');
          const name = nameData.toString('utf8');
          
          if (name === 'Content-Type') {
            const valueData = Buffer.from(tag.value, 'base64url');
            const contentType = valueData.toString('utf8');
            fileExtension = contentType.split('/').pop() || 'bin';
            break;
          }
        }
        
        // Now fetch the actual data
        const dataUrl = `https://arweave.net/${id}`;
        const dataResponse = await axios.get(dataUrl, {
          responseType: 'arraybuffer' // Important for binary data
        });
        
        if (dataResponse.status !== 200) {
          continue;
        }
        
        console.log(`Retrieved encrypted asset (${dataResponse.data.byteLength} bytes) with extension .${fileExtension}`);
        return {
          data: Buffer.from(dataResponse.data),
          fileExtension
        };
      } catch (error) {
        // Continue to the next format
      }
    } catch (error) {
      // Continue to the next format
    }
  }
  
  // If all formats fail, throw an error
  throw new Error("Failed to retrieve asset from Arweave with any of the attempted transaction ID formats");
}

// =============================================================================
// Decryption Functions
// =============================================================================

/**
 * Decrypts a symmetric key using the beneficiary's private key
 * Matches the CryptionManager.decryptSymmetricKey implementation in Swift
 * 
 * @param {string} encryptedSymmetricKey Hex-encoded encrypted symmetric key
 * @param {string} privateKey Beneficiary's private key
 * @returns {Buffer} Decrypted symmetric key
 */
function decryptSymmetricKey(encryptedSymmetricKey, privateKey) {
  console.log('Decrypting symmetric key...');
  
  // Validate inputs
  if (!encryptedSymmetricKey || !privateKey) {
    throw new Error('Missing required parameters');
  }
  
  // Normalize private key (remove 0x prefix if present)
  let privateKeyBuffer;
  if (privateKey.startsWith('0x')) {
    privateKeyBuffer = Buffer.from(privateKey.slice(2), 'hex');
  } else {
    privateKeyBuffer = Buffer.from(privateKey, 'hex');
  }
  
  if (privateKeyBuffer.length !== 32) {
    throw new Error(`Invalid private key length: ${privateKeyBuffer.length}. Expected 32 bytes.`);
  }
  
  // Normalize encrypted key (remove 0x prefix if present)
  let encryptedKeyBuffer;
  if (encryptedSymmetricKey.startsWith('0x')) {
    encryptedKeyBuffer = Buffer.from(encryptedSymmetricKey.slice(2), 'hex');
  } else {
    encryptedKeyBuffer = Buffer.from(encryptedSymmetricKey, 'hex');
  }
  
  // Verify minimum required length
  const minimumLength = 65 + 32 + 12 + 32 + 16; // ephemeral public key + salt + nonce + minimum cipher text + tag
  if (encryptedKeyBuffer.length < minimumLength) {
    throw new Error(`Encrypted key too short: ${encryptedKeyBuffer.length}. Expected at least ${minimumLength} bytes.`);
  }
  
  // Extract components ephemeral public key (65) + salt (32) + nonce (12) + ciphertext + tag (16)
  const ephemeralPublicKey = Buffer.from(encryptedKeyBuffer.subarray(0, 65));
  const salt = Buffer.from(encryptedKeyBuffer.subarray(65, 97));
  const nonce = Buffer.from(encryptedKeyBuffer.subarray(97, 109));
  const ciphertext = Buffer.from(encryptedKeyBuffer.subarray(109, encryptedKeyBuffer.length - 16));
  const tag = Buffer.from(encryptedKeyBuffer.subarray(encryptedKeyBuffer.length - 16));
  
  try {
    // Compute ECDH shared secret
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.setPrivateKey(privateKeyBuffer);
    const rawSharedPoint = ecdh.computeSecret(ephemeralPublicKey);
    
    // Extract the X coordinate of the shared point
    const x = rawSharedPoint.length > 32 ? 
      Buffer.from(rawSharedPoint.subarray(0, 32)) : 
      Buffer.from(rawSharedPoint);
    
    // Implement secp256k1_ecdh algorithm as used in the C implementation:
    // 1. Create compressed point format (0x02 + X coordinate)
    // 2. Hash with SHA-256
    const compressedPoint = Buffer.alloc(33);
    compressedPoint[0] = 0x02;  // Prefix for even Y coordinate
    x.copy(compressedPoint, 1);
    const sharedSecret = crypto.createHash('sha256').update(compressedPoint).digest();
    
    const info = Buffer.from("app.inheritor.key-derivation-info", 'utf8');
    
    // Derive encryption key using HKDF (RFC 5869)
    const encryptionKey = hkdf(sharedSecret, salt, info, 32);
    
    // Decrypt using AES-GCM
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, nonce);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted;
  } catch (error) {
    console.error(`Error during symmetric key decryption: ${error.message}`);
    throw error;
  }
}
/**
 * Decrypt asset using symmetric key
 * Based on CryptionManager.decryptAsset in Swift
 * 
 * @param {Buffer} encryptedData Encrypted asset data
 * @param {Buffer} symmetricKey Decrypted symmetric key
 * @returns {Buffer} Decrypted asset data
 */
function decryptAsset(encryptedData, symmetricKey) {
  console.log('Decrypting asset...');
  
  if (!encryptedData || !symmetricKey) {
    throw new Error('Missing required parameters');
  }
  
  // Validate minimum length
  if (encryptedData.length < 12 + 1 + 16) {
    throw new Error('Encrypted data too short');
  }
  
  // Extract components
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

/**
 * Save decrypted data to file
 * @param {Buffer} data Decrypted data
 * @param {string} inheritanceId Inheritance ID
 * @param {string} fileExtension File extension
 */
function saveFile(data, inheritanceId, fileExtension) {
  // Create a filename based on the inheritance ID
  const shortId = inheritanceId.slice(0, 8); // Use first 8 chars of ID
  const filename = `inheritance_${shortId}.${fileExtension}`;
  
  fs.writeFileSync(filename, data);
  console.log(`\nFile saved: ${filename}`);
  
  // Get file size
  const stats = fs.statSync(filename);
  console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
}

// =============================================================================
// Core Claim Process
// =============================================================================

/**
 * Main function to claim an inheritance
 * @param {Object} options Options object
 */
async function claimInheritance(options) {
  const { inheritanceId, beneficiaryKeys, networkName, contract } = options;
  
  try {
    console.log(`\nClaiming inheritance ${inheritanceId}...`);
    
    // 1. Check if the inheritance is claimable
    const claimable = await isInheritanceClaimable(contract, inheritanceId);
    if (!claimable) {
      throw new Error('Inheritance is not in Claimable state. Cannot proceed.');
    }
    
    // 2. Fetch the Arweave transaction ID
    const arweaveTransactionId = await fetchArweaveTransactionId(contract, inheritanceId);
    console.log(`Arweave transaction ID: ${arweaveTransactionId}`);
    
    // 3. Retrieve the encrypted symmetric key from CloudFlare
    const encryptedSymmetricKey = await retrieveEncryptedSymmetricKey(inheritanceId, networkName);
    
    // 4. Decrypt the symmetric key
    const privateKeyWithout0x = beneficiaryKeys.privateKey.startsWith('0x') 
      ? beneficiaryKeys.privateKey.substring(2) 
      : beneficiaryKeys.privateKey;
    const symmetricKey = decryptSymmetricKey(encryptedSymmetricKey, privateKeyWithout0x);
    
    // 5. Fetch the encrypted asset from Arweave
    const { data: encryptedAsset, fileExtension } = await retrieveAssetFromArweave(arweaveTransactionId);
    
    // 6. Decrypt the asset
    const decryptedAsset = decryptAsset(encryptedAsset, symmetricKey);
    console.log(`Decrypted asset (${decryptedAsset.length} bytes)`);
    
    // 7. Save the decrypted file
    saveFile(decryptedAsset, inheritanceId, fileExtension);
    
    console.log('\n✅ Inheritance claimed successfully!');
    
  } catch (error) {
    console.error(`\n❌ Failed to claim inheritance: ${error.message}`);
    throw error;
  }
}

// =============================================================================
// Main Program Loop
// =============================================================================

/**
 * Main execution function
 */
async function main() {
  console.log('=== Inheritor Beneficiary Claim Tool ===');
  console.log('This tool allows you to claim inheritances and save the decrypted files.');
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
    
    // Get inheritance ID
    const inheritanceId = await question('Enter the Inheritance ID (hex string starting with 0x): ');
    if (!/^0x[a-fA-F0-9]{64}$/.test(inheritanceId)) {
      throw new Error('Invalid Inheritance ID format. Must be a 32-byte hex string with 0x prefix.');
    }
    
    // Claim the inheritance
    await claimInheritance({
      inheritanceId,
      beneficiaryKeys,
      networkName: networkChoice.toLowerCase(),
      contract,
      provider,
      signer
    });
    
  } catch (error) {
    console.error('\nError:', error.message);
  } finally {
    rl.close();
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});