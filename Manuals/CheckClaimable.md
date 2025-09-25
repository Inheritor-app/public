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

1. **Exported Key File**: Your exported keys from the Inheritor iOS app (InheritorKeys_YYYY-MM-DD.json)
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
   - Export your keys from the Inheritor iOS app
   - Place the exported `InheritorKeys_YYYY-MM-DD.json` file in the `./keys/` directory
   - The script will automatically detect and use the most recent key file

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
  - If needed, transfers ETH from