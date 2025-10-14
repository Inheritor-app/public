# Inheritor Beneficiary Check Tool
## User Manual

## Table of Contents
1. [Introduction](#introduction)
2. [Before You Begin](#before-you-begin)
3. [Installation](#installation)
4. [Running the Tool](#running-the-tool)
5. [Understanding Each Function](#understanding-each-function)
6. [Technical Background](#technical-background)
7. [Troubleshooting](#troubleshooting)
8. [Security Considerations](#security-considerations)
9. [Related Tools](#related-tools)

## Introduction

The Inheritor Beneficiary Check Tool allows beneficiaries to monitor and interact with their digital inheritances before claiming them. This tool provides visibility into inheritance status and can trigger state changes to make inheritances claimable when appropriate conditions are met.

The tool works with the quantum-safe Inheritor system that uses advanced post-quantum cryptography (ML-KEM-768) to ensure your inheritances remain secure against future quantum computing threats. While this tool focuses on status checking and management functions, it's designed to work seamlessly with the quantum-safe architecture.

With this tool, you can:
- View all inheritances designated to your beneficiary address
- Check if specific inheritances are claimable (and potentially trigger state changes)
- Refund unused ETH from your beneficiary wallet to your gas wallet

This tool is designed as a companion to the Beneficiary Claim Tool, helping you verify when inheritances become available for claiming using quantum-resistant cryptography.

## Before You Begin

Before using this tool, you'll need:

1. **Exported Key File**: Your exported keys from the Inheritor iOS app (InheritorKeys_YYYY-MM-DD.json)
   - Contains both Ethereum private keys and ML-KEM-768 quantum-safe keys
   - Required for beneficiary address derivation and future quantum-safe claiming
2. **Gas Wallet Private Key**: A private key for a wallet containing ETH to pay for transaction fees
3. **Environment Setup**: A .env file configured with your gas wallet private key
4. **Network Information**: Knowledge of which network (Ethereum or Arbitrum) to connect to
5. **Internet Connection**: Access to the Ethereum or Arbitrum networks
6. **Inheritance IDs** (optional): If you know specific inheritance IDs you want to check

## Installation

### Installing Node.js (Required)

This tool requires Node.js, which is NOT included by default in macOS, Windows, or Linux systems. You'll need to install it first:

#### macOS:
1. Option 1: Download the installer from [Node.js website](https://nodejs.org/)
2. Option 2: If you have Homebrew, run: `brew install node`

#### Windows:
1. Download and run the installer from [Node.js website](https://nodejs.org/)

#### Linux:
1. Ubuntu/Debian: `sudo apt update && sudo apt install nodejs npm`
2. Fedora: `sudo dnf install nodejs`
3. Arch: `sudo pacman -S nodejs npm`

### Setting Up the Tool

Once Node.js is installed:

1. Navigate to the UserRecovery directory
2. Install required dependencies:

```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```
Edit the `.env` file and add your gas wallet private key:
```
GAS_WALLET_PRIVATE_KEY=your_private_key_here
```
Note: Private key can be provided with or without the 0x prefix.

4. Set up beneficiary keys:
   - Export your keys from the Inheritor iOS app (includes both Ethereum and ML-KEM-768 quantum keys)
   - Place the exported `InheritorKeys_YYYY-MM-DD.json` file in the `./keys/` directory
   - The script will automatically detect and use the most recent key file
   - Note: The key file contains quantum-safe cryptographic keys for future-proof inheritance claiming

5. To verify Node.js is installed correctly, run:
```bash
node --version
```
This should display the Node.js version (should be 16.0.0 or higher)

## Running the Tool

To start the tool, run:

```bash
node scripts/Beneficiary_CheckClaimable.js
```

### Initial Setup Process

1. **Automatic Key Loading**:
   - The script automatically loads your beneficiary keys from the exported JSON file
   - It displays the beneficiary address derived from the key file
   - If there's an error, it provides helpful instructions for placing the key file correctly

2. **Automatic Gas Wallet Setup**:
   - The script reads your gas wallet private key from the .env file
   - It displays the gas wallet address
   - Ensure this wallet contains sufficient ETH for transaction fees

3. **Select Network**:
   - Type either `ethereum` or `arbitrum` (case insensitive)
   - Press Enter to confirm

4. **RPC Configuration**:
   - Choose option `1` if you have your own RPC URL (Infura, Alchemy, etc.)
   - Choose option `2` to use public endpoints
   - If using option `1`, enter your complete RPC URL when prompted

5. **Main Menu**:
   The tool will connect to the network and display the main menu:
   ```
   === Main Menu ===
   1. Show received Inheritances
   2. Check if inheritance is claimable
   3. Fund beneficiary wallet
   4. Refund remaining ETH to gas wallet
   5. Exit
   ```

### User Interface Tips

- **Menu Selection**: Enter only the number (1-5) of your chosen option
- **Inheritance IDs**: Always enter full inheritance IDs with the 0x prefix
- **Yes/No Questions**: Always type the full word `yes` or `no` when prompted
- **Waiting for Transactions**: When sending transactions, be patient while waiting for confirmations
- **Returning to Menu**: After completing an action, press Enter to return to the main menu

## Understanding Each Function

### 1. Show Received Inheritances

This function displays all inheritances designated to your beneficiary address.

- **Process**:
  - Connects to the blockchain
  - Retrieves inheritance IDs associated with your address
  - Fetches all inheritance details
  - Displays a formatted list with key details

- **Display Information**:
  - Inheritance IDs
  - Testator addresses
  - Current state (color-coded for easy recognition)
  - Scheduled transfer time (if applicable)

- **When to Use**:
  - To get an overview of all inheritances you're designated to receive
  - To identify which inheritances to check for claimability
  - To verify inheritance details before attempting to check or claim

### 2. Check if Inheritance is Claimable

This function verifies if a specific inheritance is claimable and may update its state on the blockchain.

- **Process**:
  - Retrieves detailed information about the inheritance
  - Verifies you are the intended beneficiary
  - Checks beneficiary wallet balance for gas
  - Calls the `isClaimable` contract function
  - Updates and displays the new inheritance state

- **Important Notes**:
  - Requires the full 64-character inheritance ID (with 0x prefix)
  - May trigger a state change on the blockchain if conditions are met
  - Requires sufficient ETH in your beneficiary wallet for gas
  - Will warn you if you're not the designated beneficiary
  - Shows possible reasons if inheritance is not yet claimable

- **When to Use**:
  - To verify when an inheritance becomes available for claiming
  - After a testator has missed their check-in deadline
  - To trigger the state transition from Designated to Claimable
  - Before attempting to use the Claim Tool

### 3. Fund Beneficiary Wallet

This function transfers ETH from your gas wallet to the beneficiary wallet.

- **Process**:
  - Displays current balances of both wallets
  - Prompts you for the amount of ETH to transfer
  - Confirms your intention (requires typing "yes")
  - Sends transaction from gas wallet to beneficiary wallet
  - Displays updated balances after transfer

- **Important Notes**:
  - Requires sufficient ETH in your gas wallet
  - Useful for pre-funding the beneficiary wallet before checking claimability
  - Gives you manual control over funding amounts
  - Transfer amount must be greater than zero

- **When to Use**:
  - When you need to manually fund the beneficiary wallet
  - Before checking claimability to avoid insufficient funds errors
  - To ensure sufficient funds are available for gas-intensive operations
  - As preparation before claiming inheritances

### 4. Refund Remaining ETH

This function returns unused ETH from the beneficiary wallet to your gas wallet.

- **Process**:
  - Checks the beneficiary wallet's ETH balance
  - Confirms your intention (requires typing "yes")
  - Calculates maximum amount that can be safely refunded
  - Sends transaction to return funds to gas wallet

- **Important Notes**:
  - Small amounts (< 0.001 ETH) cannot be refunded reliably
  - Some ETH is kept to cover the transaction fee
  - Will display both wallets' balances before and after

- **When to Use**:
  - After checking inheritances to recover unused ETH
  - When you want to consolidate funds back to your main wallet
  - To avoid leaving small amounts of ETH in the beneficiary wallet

### 5. Exit

Safely exits the application.

## Technical Background

### Understanding Key Terms

#### Inheritance ID
- A unique 32-byte identifier for each inheritance (shown as 0x followed by 64 hexadecimal characters)
- Used to reference specific inheritances when checking or claiming
- Can be obtained from the "Show received Inheritances" function

#### Beneficiary EOA (Externally Owned Account)
- Your Ethereum address derived from your exported keys
- The address designated to receive the inheritance
- Used to identify which inheritances belong to you

#### Claimable State
- An inheritance state indicating it can be claimed by the beneficiary
- Triggered when testator fails to check-in within the required timeframe
- May also require verifier approval depending on the Digital Will configuration

### Inheritance States

The tool displays inheritance states with the following meanings:

- **Designated** (Green): Inheritance is set up but not yet claimable
- **Claimable** (Yellow/Orange): Inheritance can now be claimed
- **Claimed** (Blue): Inheritance has already been claimed
- **Revoked** (Red): Testator cancelled this inheritance
- **Purged** (Gray): Inheritance removed from the system

### Why Check Claimability?

The `isClaimable` function serves two purposes:
1. **Query**: Checks if an inheritance is ready to be claimed
2. **State Update**: If conditions are met, transitions the inheritance to Claimable state

This is necessary before using the Claim Tool, as inheritances must be in the Claimable state to be claimed.

## Troubleshooting

### Common Errors and Solutions

#### "Invalid Inheritance ID format"
- **Cause**: Inheritance ID format is incorrect
- **Solution**: Ensure the ID starts with 0x and is exactly 66 characters long (0x + 64 hex characters)

#### "You are not the beneficiary of this inheritance"
- **Cause**: The inheritance is designated to a different address
- **Solution**: Verify you're using the correct exported key file, or this inheritance is not meant for you

#### "Insufficient funds for transaction"
- **Cause**: Beneficiary wallet doesn't have enough ETH for gas
- **Solution**: Use menu option 3 to fund your beneficiary wallet, then try again

#### "This inheritance is NOT YET CLAIMABLE"
- **Cause**: Conditions for claiming haven't been met yet
- **Solution**: Wait for the testator's check-in deadline to pass, or check if verification is required

#### "Connection failed"
- **Cause**: RPC provider is unavailable or rate-limited
- **Solution**: Try option 2 to use public endpoints, or use your own Infura/Alchemy key

#### "No inheritances found for this beneficiary"
- **Cause**: No inheritances are designated to your beneficiary address
- **Solution**: Verify you're connected to the correct network and using the correct keys

### When to Seek Help

If you encounter persistent errors not covered above, please:
1. Take note of the exact error message
2. Do not share your private keys with anyone
3. Contact official support channels

## Security Considerations

- **Use on a Secure Device**: Run the tool on a private, secure computer
- **Network Security**: Prefer a trusted network connection
- **Protect Your Keys**: Never share your exported key file or private keys
- **Verify Inheritance IDs**: Double-check inheritance IDs before submitting transactions
- **Understand State Changes**: The isClaimable function can modify blockchain state
- **Gas Costs**: Be aware that checking claimability requires a blockchain transaction

## Related Tools

The Inheritor CLI Tools suite includes three complementary command-line applications:

1. **Testator CLI Management Tool**: For testators to manage their Digital Will
2. **Beneficiary Check Tool** (this tool): For beneficiaries to monitor and check claimability of inheritances
3. **Beneficiary Claim Tool**: For beneficiaries to claim and decrypt inherited digital assets

Each tool serves a specific purpose in the inheritance lifecycle. Use this Check Tool to monitor inheritance status, then use the Claim Tool when inheritances become claimable.

---

**Disclaimer**: This tool is provided as-is for checking inheritance status. While efforts have been made to ensure its security and accuracy, use it at your own risk. Always verify the effects of any blockchain transactions, as they cannot be reversed once confirmed.