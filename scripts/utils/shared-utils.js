/**
 * Shared utilities for Inheritor emergency management scripts
 *
 * This module provides common functionality for all scripts including:
 * - Contract utilities and deployment block optimization
 * - Formatting utilities
 * - Network configuration and setup
 * - Constants and ABI definitions
 * - Error handling patterns
 * - Migration data processing
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// =============================================================================
// CONSTANTS
// =============================================================================

// Network & Contract Constants
const NETWORK_CONSTANTS = {
    ETHEREUM_CHAIN_ID: 1,
    ARBITRUM_CHAIN_ID: 42161,
    PROXY_CONTRACT_ADDRESS: '0x8743E613486Df310cC549cd57860c28c8438892E', // Only on Ethereum, V2.1.0 (test): MAKE SURE TO UPDATE TO PROD ADDRESS WHEN PUSHING TO PUBLIC GIT
    ZERO_ADDRESS: '0x0000000000000000000000000000000000000000'
};

// Network configurations with fallback RPC endpoints
const NETWORK_CONFIGS = {
    ethereum: {
        name: 'Ethereum Mainnet',
        chainId: NETWORK_CONSTANTS.ETHEREUM_CHAIN_ID,
        publicFallbacks: [
            'https://eth.llamarpc.com',
            'https://rpc.ankr.com/eth',
            'https://cloudflare-eth.com'
        ]
    },
    arbitrum: {
        name: 'Arbitrum One',
        chainId: NETWORK_CONSTANTS.ARBITRUM_CHAIN_ID,
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
// CONTRACT ABIs
// =============================================================================

// ABI Fragments for the contracts
const CONTRACT_ABIS = {
    PROXY_ABI: [
        'function getContractAddress(uint256 chainId) external view returns (address)'
    ],

    INHERITOR_ABI: [
        'function inheritances(bytes32 inheritanceId) public view returns (address testatorEOA, address testatorSAA, address beneficiaryEOA, address beneficiarySAA, uint256 gracePeriod, uint8 state, bytes32 arweaveTransactionId, uint256 scheduledTransferTime)',
        'function digitalWill(address testatorEOA, uint256 index) public view returns (bytes32)',
        'function digitalWill(address) public view returns (bytes32[])',
        'function testatorLastCheckIn(address) public view returns (uint256)',
        'function checkInInterval(address) public view returns (uint256)',
        'function revokeInheritance(bytes32 inheritanceId) external',
        'function checkIn(uint256 newInterval) public',
        'function testatorVerifier(address) external view returns (address)',
        'function updateVerifier(address verifier, uint256 verificationDelay) external',
        'function isClaimable(bytes32 inheritanceId) public returns (bool)',
        'function getBeneficiaryInheritances(address beneficiaryEOA) external view returns (bytes32[] memory)',
        'function exportContractForMigration(bytes32[] calldata inheritanceIds) external view returns (tuple(bytes32[] inheritanceIds, tuple(address testatorEOA, address testatorSAA, address beneficiaryEOA, address beneficiarySAA, uint256 gracePeriod, uint8 state, bytes32 arweaveTransactionId, uint256 scheduledTransferTime)[] inheritanceData, address[] testators, uint256[] lastCheckIns, uint256[] checkInIntervals, address[] verifiers, uint256[] verificationDelays, bool[] needsVerification, uint256[] verificationCounts))',
        'event AddInheritance(bytes32 indexed inheritanceId, address indexed testatorEOA, address indexed beneficiaryEOA)'
    ]
};

// =============================================================================
// FORMATTING UTILITIES
// =============================================================================

const formatters = {
    /**
     * Format duration in seconds to a readable string
     * @param {number|bigint} seconds Time duration in seconds
     * @returns {string} Formatted duration string
     */
    formatDuration: function(seconds) {
        // Convert BigInt to Number if needed
        const secs = typeof seconds === 'bigint' ? Number(seconds) : Number(seconds);

        if (secs < 60) return `${secs} seconds`;
        if (secs < 3600) return `${Math.floor(secs / 60)} minutes`;
        if (secs < 86400) return `${Math.floor(secs / 3600)} hours`;
        return `${Math.floor(secs / 86400)} days`;
    },

    /**
     * Format timestamp to a readable date and time
     * @param {number|bigint} timestamp Unix timestamp in seconds
     * @returns {string} Formatted date and time
     */
    formatTimestamp: function(timestamp) {
        // Convert BigInt to Number if needed
        const ts = typeof timestamp === 'bigint' ? Number(timestamp) : Number(timestamp);
        return new Date(ts * 1000).toLocaleString();
    },

    /**
     * Format address for display (short version)
     * @param {string} address Ethereum address
     * @returns {string} Formatted address
     */
    formatAddress: function(address) {
        if (!address) return 'Not set';
        return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    },

    /**
     * Format ETH value from wei
     * @param {bigint|string} weiValue Wei value as BigInt or string
     * @returns {string} Formatted ETH value
     */
    formatEth: function(weiValue) {
        // Convert BigInt to string for ethers
        const weiString = weiValue.toString();
        // Use ethers to format to Ether units
        let ethValue = ethers.formatEther(weiString);
        // Only show 6 decimal places maximum
        const parts = ethValue.split('.');
        if (parts.length > 1 && parts[1].length > 6) {
            ethValue = `${parts[0]}.${parts[1].substring(0, 6)}`;
        }
        return ethValue;
    },

    /**
     * Format bytes to readable size
     * @param {number} bytes Number of bytes
     * @returns {string} Formatted size string
     */
    formatBytes: function(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};

// =============================================================================
// CONTRACT UTILITIES
// =============================================================================

// Global deployment block cache
const deploymentBlockCache = {};

const contractUtils = {
    /**
     * Validate Ethereum address
     * @param {string} address Address to validate
     * @returns {boolean} True if valid
     */
    isValidAddress: function(address) {
        if (!address || typeof address !== 'string') {
            return false;
        }
        return ethers.isAddress(address);
    },

    /**
     * Find deployment block by querying for earliest log
     * @param {object} provider - Ethers provider
     * @param {string} address - Contract address
     * @returns {number} - Block number of earliest event (deployment block or later)
     */
    findDeploymentBlockViaLogs: async function(provider, address) {
        try {
            // The provider might be a Wallet, so we need to get the actual JSON-RPC provider
            let actualProvider = provider;

            // If it's a Wallet, get the provider from it
            if (provider.constructor?.name === 'Wallet' && provider.provider) {
                actualProvider = provider.provider;
            }

            // Use the ethers v6 getLogs method with proper filter object
            const logs = await actualProvider.getLogs({
                address: address,
                fromBlock: 0,
                toBlock: "latest"
            });

            if (!logs || logs.length === 0) {
                return 0;
            }

            // Get the earliest log's block number
            const firstLogBlock = logs[0].blockNumber;
            return firstLogBlock;

        } catch (error) {
            throw error; // Let the calling function handle error logging
        }
    },

    /**
     * Get deployment block for a contract with caching
     * This is the main function modules should use to avoid rate limiting
     * @param {object} contract - Ethers contract instance
     * @param {string} address - Contract address (optional, will use contract.target)
     * @returns {number} - Block number to start queries from (0 if not found)
     */
    getDeploymentBlockForContract: async function(contract, address = null) {
        const contractAddress = address || contract.target || contract.address;

        if (!contractAddress) {
            console.warn('⚠️ No contract address provided, using block 0');
            return 0;
        }

        // Getting deployment block for contract optimization

        // Check cache first
        const cacheKey = contractAddress.toLowerCase();
        if (deploymentBlockCache[cacheKey]) {
            // Using cached deployment block
            return deploymentBlockCache[cacheKey];
        }

        // Find it dynamically
        try {
            // Searching blockchain for earliest event
            const block = await this.findDeploymentBlockViaLogs(
                contract.runner || contract.provider,
                contractAddress
            );

            // Cache the result (even if it's 0)
            deploymentBlockCache[cacheKey] = block;

            if (block > 0) {
                // Cached deployment block with earliest event found
            } else {
                // Cached deployment block with no events found, using fallback
            }

            return block;
        } catch (error) {
            console.warn(`❌ Failed to get deployment block for ${contractAddress}:`, error.message);
            return 0;
        }
    },

    /**
     * Process migration data into structured testator information
     * @param {object} migrationData - Raw data from exportContractForMigration
     * @returns {array} Array of processed testator information
     */
    processMigrationDataToTestators: function(migrationData) {
        const testatorInfoList = [];
        const now = Math.floor(Date.now() / 1000);

        // Create a map of inheritance counts per testator
        const inheritanceCountMap = new Map();
        const inheritanceIdsByTestator = new Map();

        for (let i = 0; i < migrationData.inheritanceData.length; i++) {
            const inheritance = migrationData.inheritanceData[i];
            const testatorEOA = inheritance.testatorEOA;
            const inheritanceId = migrationData.inheritanceIds[i];

            if (!inheritanceCountMap.has(testatorEOA)) {
                inheritanceCountMap.set(testatorEOA, 0);
                inheritanceIdsByTestator.set(testatorEOA, []);
            }
            inheritanceCountMap.set(testatorEOA, inheritanceCountMap.get(testatorEOA) + 1);
            inheritanceIdsByTestator.get(testatorEOA).push(inheritanceId);
        }

        // Process each testator from the migration data
        for (let i = 0; i < migrationData.testators.length; i++) {
            const testatorEOA = migrationData.testators[i];
            const lastCheckIn = Number(migrationData.lastCheckIns[i]);
            const checkInInterval = Number(migrationData.checkInIntervals[i]);
            const verifier = migrationData.verifiers[i];
            const verificationDelay = Number(migrationData.verificationDelays[i]);
            const needsVerification = migrationData.needsVerification[i];
            const verificationCount = Number(migrationData.verificationCounts[i]);

            const inheritanceCount = inheritanceCountMap.get(testatorEOA) || 0;
            const inheritanceIds = inheritanceIdsByTestator.get(testatorEOA) || [];

            // Calculate time until next check-in
            const nextCheckInTime = lastCheckIn + checkInInterval;
            const timeUntilNextCheckIn = nextCheckInTime - now;

            testatorInfoList.push({
                address: testatorEOA,
                lastCheckIn: lastCheckIn,
                checkInInterval: checkInInterval,
                nextCheckInTime: nextCheckInTime,
                timeUntilNextCheckIn: timeUntilNextCheckIn,
                verifier: verifier,
                verificationDelay: verificationDelay,
                needsVerification: needsVerification,
                verificationCount: verificationCount,
                inheritanceCount: inheritanceCount,
                inheritanceIds: inheritanceIds
            });
        }

        return testatorInfoList;
    },

    /**
     * Process migration data into inheritance details
     * @param {object} migrationData - Raw data from exportContractForMigration
     * @returns {array} Array of processed inheritance details
     */
    processMigrationDataToInheritances: function(migrationData) {
        const inheritancesList = [];

        for (let i = 0; i < migrationData.inheritanceData.length; i++) {
            const inheritance = migrationData.inheritanceData[i];
            const inheritanceId = migrationData.inheritanceIds[i];

            inheritancesList.push({
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
            });
        }

        return inheritancesList;
    }
};

// =============================================================================
// NETWORK UTILITIES
// =============================================================================

const networkUtils = {
    /**
     * Set up an Ethereum provider with retry logic
     * Attempts to connect to user-specified or public RPC endpoints
     *
     * @param {Object} networkConfig Network configuration object
     * @param {Function} questionFn Question function for user input
     * @returns {Promise<JsonRpcProvider>} Connected provider
     */
    setupProvider: async function(networkConfig, questionFn) {
        console.log('\nRPC Configuration:');
        console.log('1. Enter custom RPC URL (recommended: Infura, Alchemy, etc.)');
        console.log('2. Use public RPC endpoints (may be less reliable)');
        const rpcChoice = await questionFn('Your choice (1-2): ');

        let rpcUrl;
        if (rpcChoice === '1') {
            rpcUrl = await questionFn(`Enter RPC URL for ${networkConfig.name}: `);
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
    },

    /**
     * Get contract address from Ethereum proxy for any chain
     * @param {JsonRpcProvider} provider Ethereum provider
     * @param {number} targetChainId Target chain ID
     * @returns {Promise<string>} Contract address
     */
    getContractAddressFromProxy: async function(provider, targetChainId) {
        console.log(`Retrieving ${targetChainId === NETWORK_CONSTANTS.ETHEREUM_CHAIN_ID ? 'Ethereum' : 'Arbitrum'} contract address from proxy...`);

        // First ensure we're connected to Ethereum where the proxy is deployed
        const network = await provider.getNetwork();
        const isEthereumProvider = network.chainId === BigInt(NETWORK_CONSTANTS.ETHEREUM_CHAIN_ID);

        if (!isEthereumProvider) {
            throw new Error("Must use an Ethereum provider to access the proxy contract");
        }

        // Check if proxy contract exists at the address
        const code = await provider.getCode(NETWORK_CONSTANTS.PROXY_CONTRACT_ADDRESS);
        if (code === '0x') {
            throw new Error(`No contract found at proxy address ${NETWORK_CONSTANTS.PROXY_CONTRACT_ADDRESS}`);
        }

        const proxyContract = new ethers.Contract(
            NETWORK_CONSTANTS.PROXY_CONTRACT_ADDRESS,
            CONTRACT_ABIS.PROXY_ABI,
            provider
        );

        const contractAddress = await proxyContract.getContractAddress(targetChainId);

        // Check if the contract is in maintenance mode (address is 0x0)
        if (contractAddress === NETWORK_CONSTANTS.ZERO_ADDRESS) {
            throw new Error(`Contract on chain ID ${targetChainId} is currently in maintenance mode.`);
        }

        return contractAddress;
    },

    /**
     * Get contract address for network
     * @param {JsonRpcProvider} provider Provider for the network
     * @param {Object} networkConfig Network configuration
     * @param {Function} questionFn Question function for user input
     * @returns {Promise<string>} Contract address
     */
    getContractAddressForNetwork: async function(provider, networkConfig, questionFn) {
        let contractAddress;
        let ethProvider;

        try {
            // If we're already on Ethereum, use the current provider
            if (networkConfig.chainId === NETWORK_CONSTANTS.ETHEREUM_CHAIN_ID) {
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
                    const ethRpcUrl = await questionFn('Please enter an Ethereum RPC URL: ');
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
            contractAddress = await this.getContractAddressFromProxy(ethProvider, networkConfig.chainId);
            console.log(`Contract address for ${networkConfig.name}: ${contractAddress}`);

        } catch (error) {
            console.error(`\nError getting contract address from proxy: ${error.message}`);
            console.log('Falling back to manual entry mode.');
            contractAddress = await questionFn(`Please enter the Inheritor contract address for ${networkConfig.name}: `);
            if (!contractUtils.isValidAddress(contractAddress)) {
                throw new Error('Invalid contract address format');
            }
        }

        return contractAddress;
    }
};

// =============================================================================
// ERROR HANDLING UTILITIES
// =============================================================================

const errorHandlers = {
    /**
     * Handle contract interaction errors with user-friendly messages
     * @param {Error} error The error to handle
     * @param {string} operation Name of the operation for context
     * @returns {string} User-friendly error message
     */
    handleContractError: function(error, operation = 'contract interaction') {
        console.error(`Error during ${operation}:`, error);

        // Common error patterns and user-friendly messages
        if (error.message.includes('user rejected')) {
            return 'Transaction was cancelled by user';
        }

        if (error.message.includes('insufficient funds')) {
            return 'Insufficient funds for transaction';
        }

        if (error.message.includes('network')) {
            return 'Network connection error. Please check your connection and try again';
        }

        if (error.message.includes('contract')) {
            return 'Contract interaction failed. Please verify the contract address and try again';
        }

        // Default message
        return `${operation} failed: ${error.message || 'Unknown error'}`;
    }
};

// =============================================================================
// KEY MANAGEMENT UTILITIES
// =============================================================================

const keyUtils = {
    /**
     * Load testator keys from exported JSON key file
     * @param {string} keysDir Directory containing key files (defaults to ../keys)
     * @returns {Object} Object containing address, privateKey, and publicKey
     */
    loadTestatorKeysFromFile: function(keysDir = null) {
        if (!keysDir) {
            keysDir = path.join(__dirname, '..', '..', 'keys');
        }

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
    },

    /**
     * Load beneficiary keys from exported JSON key file
     * @param {string} keysDir Directory containing key files (defaults to ../keys)
     * @returns {Object} Object containing address, privateKey, and publicKey
     */
    loadBeneficiaryKeysFromFile: function(keysDir = null) {
        if (!keysDir) {
            keysDir = path.join(__dirname, '..', '..', 'keys');
        }

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

            // Validate the JSON structure for beneficiary
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
    },

    /**
     * Load beneficiary quantum-safe keys from exported JSON key file
     * @param {string} keysDir Directory containing key files (defaults to ../keys)
     * @returns {Object} Object containing privateKey and publicKey (base64 strings)
     */
    loadBeneficiaryQuantumKeys: function(keysDir = null) {
        if (!keysDir) {
            keysDir = path.join(__dirname, '..', '..', 'keys');
        }

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

        console.log(`Loading quantum keys from: ${keyFile}`);

        try {
            // Read and parse the JSON file
            const keyFileContent = fs.readFileSync(keyFilePath, 'utf8');
            const keyData = JSON.parse(keyFileContent);

            // Validate the JSON structure for beneficiary quantum keys
            if (!keyData.beneficiary || !keyData.beneficiary.quantumSafe) {
                throw new Error('Invalid key file format: missing beneficiary.quantumSafe section');
            }

            const quantumKeys = keyData.beneficiary.quantumSafe;

            // Validate required fields
            if (!quantumKeys.privateKey || !quantumKeys.publicKey) {
                throw new Error('Invalid key file format: missing quantum keys');
            }

            return {
                privateKey: quantumKeys.privateKey, // base64 encoded quantum private key
                publicKey: quantumKeys.publicKey    // base64 encoded quantum public key
            };

        } catch (error) {
            if (error.message.includes('JSON')) {
                throw new Error(`Failed to parse key file: ${error.message}`);
            }
            throw error;
        }
    }
};

// =============================================================================
// WALLET UTILITIES
// =============================================================================

const walletUtils = {
    /**
     * Interactive wallet funding function for menu-driven scripts
     * @param {Object} targetWalletKeys - Object containing {address, privateKey, publicKey}
     * @param {ethers.Wallet} gasWallet - Gas wallet for funding transfers
     * @param {ethers.Provider} provider - Network provider
     * @param {string} walletRole - Role name for display ("Beneficiary", "Testator", etc.)
     * @param {Function} questionFn - Question function for user input
     * @returns {Promise<void>}
     */
    fundWallet: async function(targetWalletKeys, gasWallet, provider, walletRole, questionFn) {
        console.log(`\n=== Fund ${walletRole} Wallet ===`);

        // Create target wallet instance
        const targetWallet = new ethers.Wallet(targetWalletKeys.privateKey, provider);

        // Get current balances
        const targetBalance = await provider.getBalance(targetWallet.address);
        const gasBalance = await provider.getBalance(gasWallet.address);

        console.log(`\n📊 Current Balances:`);
        console.log(`${walletRole} wallet (${targetWallet.address}): ${ethers.formatEther(targetBalance)} ETH`);
        console.log(`Gas wallet (${gasWallet.address}): ${ethers.formatEther(gasBalance)} ETH`);

        if (gasBalance === 0n) {
            console.log('\n❌ Gas wallet has no funds available for transfer.');
            return;
        }

        // Suggest transfer amounts
        console.log('\n💡 Suggested amounts:');
        console.log('1. 0.001 ETH (small transactions)');
        console.log('2. 0.005 ETH (multiple transactions)');
        console.log('3. 0.01 ETH (extended usage)');
        console.log('4. Custom amount');
        console.log('5. Cancel');

        const choice = await questionFn('Select option (1-5): ');

        let transferAmount;
        switch (choice) {
            case '1':
                transferAmount = ethers.parseEther('0.001');
                break;
            case '2':
                transferAmount = ethers.parseEther('0.005');
                break;
            case '3':
                transferAmount = ethers.parseEther('0.01');
                break;
            case '4':
                const customAmount = await questionFn('Enter amount in ETH: ');
                try {
                    transferAmount = ethers.parseEther(customAmount);
                } catch (error) {
                    console.log('❌ Invalid amount format.');
                    return;
                }
                break;
            case '5':
                console.log('Transfer cancelled.');
                return;
            default:
                console.log('❌ Invalid choice.');
                return;
        }

        // Validate gas wallet has enough funds
        if (gasBalance < transferAmount) {
            console.log(`❌ Gas wallet has insufficient funds.`);
            console.log(`Required: ${ethers.formatEther(transferAmount)} ETH`);
            console.log(`Available: ${ethers.formatEther(gasBalance)} ETH`);
            return;
        }

        // Final confirmation
        console.log(`\n💸 Transfer ${ethers.formatEther(transferAmount)} ETH to ${walletRole.toLowerCase()} wallet?`);
        const confirmation = await questionFn('Confirm (yes/no): ');

        if (confirmation.toLowerCase() !== 'yes') {
            console.log('Transfer cancelled.');
            return;
        }

        // Execute transfer
        try {
            console.log('\nTransferring funds...');
            const tx = await gasWallet.sendTransaction({
                to: targetWallet.address,
                value: transferAmount
            });

            console.log(`Transaction sent: ${tx.hash}`);
            console.log('Waiting for confirmation...');
            await tx.wait();

            // Show new balances
            const newTargetBalance = await provider.getBalance(targetWallet.address);
            const newGasBalance = await provider.getBalance(gasWallet.address);

            console.log('\n✅ Transfer completed!');
            console.log(`New ${walletRole.toLowerCase()} wallet balance: ${ethers.formatEther(newTargetBalance)} ETH`);
            console.log(`New gas wallet balance: ${ethers.formatEther(newGasBalance)} ETH`);

        } catch (error) {
            console.error(`❌ Transfer failed: ${error.message}`);
        }
    },

    /**
     * Refund remaining ETH from a wallet back to the gas wallet
     * @param {Object} sourceWalletKeys - Object containing {address, privateKey, publicKey}
     * @param {string} gasWalletAddress - Gas wallet address to refund to
     * @param {ethers.Provider} provider - Network provider
     * @param {string} walletRole - Role name for display ("Beneficiary", "Testator", etc.)
     * @param {Function} questionFn - Question function for user input
     * @returns {Promise<void>}
     */
    refundWallet: async function(sourceWalletKeys, gasWalletAddress, provider, walletRole, questionFn) {
        console.log(`\n=== Refund ${walletRole} Wallet ===`);

        try {
            // Create source wallet
            const sourceWallet = new ethers.Wallet(sourceWalletKeys.privateKey, provider);

            // Get current balance
            const balance = await provider.getBalance(sourceWallet.address);
            console.log(`\n${walletRole} wallet (${sourceWallet.address}) balance: ${ethers.formatEther(balance)} ETH`);

            // Check if there are any funds to refund
            if (balance <= 0) {
                console.log('No funds to refund.');
                return;
            }

            // Define minimum refundable amount
            const minimumRefundable = ethers.parseEther(GAS_CONSTANTS.MIN_REFUNDABLE_AMOUNT);

            if (balance < minimumRefundable) {
                console.log(`Balance too low to refund reliably (less than ${GAS_CONSTANTS.MIN_REFUNDABLE_AMOUNT} ETH).`);
                console.log(`For very small amounts, the gas cost approaches or exceeds the refund value.`);
                return;
            }

            // Ask for confirmation
            const confirmation = await questionFn(`Do you want to refund ${ethers.formatEther(balance)} ETH to gas wallet (${gasWalletAddress})? (yes/no): `);

            if (confirmation.toLowerCase() !== 'yes') {
                console.log('Refund cancelled.');
                return;
            }

            // Calculate gas costs
            const gasPrice = (await provider.getFeeData()).gasPrice;
            const gasLimit = BigInt(GAS_CONSTANTS.STANDARD_TRANSFER_GAS);
            const gasCost = gasPrice * gasLimit;

            console.log(`Estimated gas cost: ${ethers.formatEther(gasCost)} ETH`);

            if (balance <= gasCost) {
                console.log('Balance too low to cover gas costs. Cannot refund.');
                return;
            }

            // Calculate refund amount (leave buffer for gas price fluctuations)
            const buffer = gasCost * BigInt(Math.floor(GAS_CONSTANTS.REFUND_BUFFER_MULTIPLIER * 10)) / BigInt(10);
            const refundAmount = balance - buffer;

            console.log(`\nSending ${ethers.formatEther(refundAmount)} ETH back to gas wallet...`);
            console.log(`(Keeping ${ethers.formatEther(buffer)} ETH for gas)`);

            // Execute refund transaction
            const tx = await sourceWallet.sendTransaction({
                to: gasWalletAddress,
                value: refundAmount,
                gasLimit: gasLimit
            });

            console.log(`Refund transaction sent: ${tx.hash}`);
            console.log('Waiting for confirmation...');

            await tx.wait();

            // Show new balances
            const newSourceBalance = await provider.getBalance(sourceWallet.address);
            const newGasBalance = await provider.getBalance(gasWalletAddress);

            console.log(`\n✅ Refund complete!`);
            console.log(`New ${walletRole.toLowerCase()} wallet balance: ${ethers.formatEther(newSourceBalance)} ETH`);
            console.log(`New gas wallet balance: ${ethers.formatEther(newGasBalance)} ETH`);

        } catch (error) {
            console.error(`\n❌ ERROR during refund: ${error.message}`);
        }
    }
};

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
    // Constants
    NETWORK_CONSTANTS,
    NETWORK_CONFIGS,
    INHERITANCE_STATES,
    STATE_NAMES,
    GAS_CONSTANTS,
    CONTRACT_ABIS,

    // Utilities
    formatters,
    contractUtils,
    networkUtils,
    errorHandlers,
    keyUtils,
    walletUtils
};