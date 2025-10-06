# Inheritor - On-Chain Digital Inheritance

## About Inheritor

A smarter, safer way to ensure your wishes are honored when the time come

**[Read the Whitepaper](WhitePaper.md)** for a comprehensive technical overview.

This repository hosts the **public‑domain reference tools** that guarantee liveness and auditability even if the mobile app is unavailable:

- A **Beneficiary Claim** script and utilities that decrypt assets once the contract state is *Claimable*
- A **Check/Monitor** script for beneficiaries
- A **Testator CLI** script to manage wills when needed

These tools exercise the project’s core architecture:

- **Architectural time‑lock** — The app or script verifies on‑chain policy (Active → Claimable → Claimed) before decryption; security does not rely on code secrecy.
- **Dual‑recipient encryption** — Every asset is encrypted for two recipients: an iOS X‑Wing path (infrastructure‑independent, non‑exportable keys) and an external ML‑KEM path (portable tools; conditional key release).
- **Open format, public domain** — The envelope format and reference clients are open so anyone can inspect, audit, and build interoperable clients.

**Who this repo is for**

- Developers and auditors who want a transparent, runnable demonstration of the protocol
- Beneficiaries and testators who need a fallback path when the Inheritor app is unavailable
- Integrators who plan to build compatible clients or services on top of the open format

## Repository Contents

```
UserRecovery/
├── Manuals/
│   ├── CheckClaimable.md
│   ├── ClaimManual.md
│   └── TestatorManual.md
├── keys/                          # Directory for exported key files
├── scripts/
│   ├── utils/
│   │   └── shared-utils.js        # Centralized utilities
│   ├── Beneficiary_CheckClaimable.js
│   ├── Beneficiary_Claim.js
│   └── Testator.js
├── .env.example                   # Environment variables template
├── .gitignore
├── README.md
|__ WhitePaper.html                # Project White Paper
├── package-lock.json
├── package.json
```

## Tool Suite

This repository provides three essential command-line tools for managing digital inheritances:

### 1. Testator CLI Management Tool (`scripts/Testator.js`)

For testators (will creators) to manage their Digital Will when the Inheritor app is unavailable:
- View the status of all inheritances in your Digital Will
- Perform check-ins to reset inheritance timers
- Revoke inheritances to permanently cancel them
- Remove verifiers from your Digital Will
- Return unused ETH to your gas wallet

### 2. Beneficiary Check Tool (`scripts/Beneficiary_CheckClaimable.js`)

For beneficiaries to monitor and check their incoming inheritances:
- View all inheritances designated to your address
- Check if specific inheritances are claimable (and potentially trigger state changes)
- Refund unused ETH to your gas wallet

### 3. Beneficiary Claim Tool (`scripts/Beneficiary_Claim.js`)

For beneficiaries to claim and decrypt their inherited digital assets:
- Verify if an inheritance is in the "Claimable" state
- Retrieve the Arweave transaction ID from the blockchain
- Fetch and decrypt the symmetric key
- Download and decrypt the inherited digital asset
- Save the decrypted file to your local system

## Getting Started

Each tool has detailed installation and usage instructions in its corresponding manual:

- Testator Tool: See [Manuals/TestatorManual.md](Manuals/TestatorManual.md)
- Beneficiary Check Tool: See [Manuals/CheckClaimable.md](Manuals/CheckClaimable.md)
- Beneficiary Claim Tool: See [Manuals/ClaimManual.md](Manuals/ClaimManual.md)

### Prerequisites

- Node.js (v16.0.0 or higher)
- Basic command-line knowledge
- For testators: Exported key file from Inheritor iOS app and a gas wallet with ETH
- For beneficiaries: Exported key file from Inheritor iOS app and a gas wallet with ETH


## Security Considerations

These tools provide direct access to your blockchain assets and sensitive cryptographic keys. Always follow these security practices:

- Run these tools only on secure, trusted devices
- Never share your exported key files, recovery mnemonics, or private keys
- Secure your `.env` file and exported key files - they contain sensitive private keys for both testator and beneficiary
- Use these tools when the Inheritor app is unavailable or for direct command-line access
- Verify all transaction details before confirming
- Move any claimed assets to secure storage immediately
- Delete exported key files after use or store them in secure, encrypted storage


#### Shared Utilities Module

Location: `/scripts/utils/shared-utils.js`

This centralized module provides common functionality across all CLI management scripts:

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```
   This will install all the Node.js packages needed to run the scripts.

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit the `.env` file and add your gas wallet private key:
   ```
   GAS_WALLET_PRIVATE_KEY=your_private_key_here
   ```
   Note: Private key can be provided with or without the 0x prefix.

3. **Set up keys (for Testator and Beneficiary tools):**
   - Export your keys from the Inheritor iOS app
   - Place the exported `InheritorKeys_YYYY-MM-DD.json` file in the `./keys/` directory
   - The scripts will automatically detect and use the most recent key file
   - Testator tools use the testator keys, beneficiary tools use the beneficiary keys from the same file

## License

This project is released into the public domain. See [LICENSE](LICENSE) for more details.

## Open Source & Community


The Inheritor project and its reference clients—including the CLI tools and a future iOS reference app—are released into the public domain to guarantee liveness and auditability for all users. By making the full technology stack open, anyone is empowered to study, copy, or fork these tools and formats.

Note: The smart contract itself is on-chain and auditable but not released into the public domain. The method that creates new inheritances requires a signature from the official Inheritor app. This ensures that the ability to originate inheritances remains a commercial feature of the main application. Community developers are free to build clients that read, verify, and claim inheritances, but creating inheritances is reserved for the official app.

However, the official Inheritor team remains the reference implementation and steward of the open dual-recipient encryption format. This ensures a single interoperable standard while welcoming community innovation.

Security in Inheritor does not depend on secrecy—openness enables trust and allows anyone to audit the code and cryptography. We believe robust security comes from transparency and public review, not obscurity.

We encourage contributions, interoperability, and adoption of the dual-recipient encryption format as an open standard for digital inheritance and beyond. Community participation is welcome to improve, extend, or integrate these tools and formats into other projects.

## Contact

For support or questions, contact: [support@inheritor.app](mailto:info@inheritor.app)

---

**Disclaimer**: These tools are provided as-is. While efforts have been made to ensure their security and accuracy, use them at your own risk. Always verify the effects of any blockchain transactions, as they cannot be reversed once confirmed.

## Acknowledgments

- The Ethereum and Arbitrum communities
- The Arweave project for permanent storage solutions
- All contributors to the Node.js packages used in this project