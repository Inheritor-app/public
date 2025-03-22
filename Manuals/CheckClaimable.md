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

With this tool, you can:
- View all inheritances designated to your beneficiary address
- Check if specific inheritances are claimable (and potentially trigger state changes)
- Refund unused ETH from your beneficiary wallet to your gas wallet

This tool is designed as a companion to the Beneficiary Claim Tool, helping you verify when inheritances become available for claiming.

## Before You Begin

Before using this tool, you'll need:

1. **Recovery Mnemonic**: Your 12 or 24-word recovery phrase for the beneficiary account
2. **Gas Wallet Private Key**: A private key for a wallet containing ETH to pay for transaction fees
3. **Network Information**: Knowledge of which network (Ethereum or Arbitrum) to connect to
4. **Internet Connection**: Access to the Ethereum or Arbitrum networks
5. **Inheritance IDs** (optional): If you know specific inheritance IDs you want to check

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

1. Save the script as `Beneficiary_CheckClaimable.js`
2. Open a terminal and navigate to the directory containing the script
3. Install required dependencies:

```bash
npm install ethers bip39 @ethersproject/hdnode axios
```

4. Make the script executable (macOS/Linux only):

```bash
chmod +x Beneficiary_CheckClaimable.js
```

5. To verify Node.js is installed correctly, run:
```bash
node --version
```
This should display the Node.js version (should be 16.0.0 or higher)

## Running the Tool

To start the tool, run:

```bash
node Beneficiary_CheckClaimable.js
```

### Initial Setup Process

1. **Enter Beneficiary Recovery Phrase**:
   - Type your complete mnemonic with all words separated by spaces
   - Example: `word1 word2 word3 ... word12`
   - Press Enter after entering all words
   - The script will display the derived address

2. **Enter Gas Wallet Private Key**:
   - Type or paste the private key of your gas wallet (with 0x prefix)
   - Example: `0x123abc...`
   - This wallet must contain ETH for transaction fees
   - The script will display the wallet address

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
   3. Refund remaining ETH to gas wallet
   4. Exit
   ```

### User Interface Tips

- **Menu Selection**: Enter only the number (1-4) of your chosen option
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
  - For each inheritance, fetches additional information
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
  - If needed, transfers ETH from