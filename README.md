# Inheritor - On-Chain Digital Inheritance

## About Inheritor

A smarter, safer way to ensure your wishes are honored when the time come

**[Read the Whitepaper](WhitePaper.pdf)** for a comprehensive technical overview.

This repository hosts the **public‑domain reference tools** that guarantee liveness and auditability even if the mobile app is unavailable:

- A **Beneficiary Claim** script and utilities that decrypt assets once the contract state is *Claimable*
- A **Check/Monitor** script for beneficiaries
- A **Testator CLI** script to manage wills when needed

These tools work with **Inheritor contract v3** and **envelope v2**. They exercise the project’s core architecture:

- **Architectural time‑lock** — The app or script verifies on‑chain policy (Active → Claimable → Claimed) before decryption; security does not rely on code secrecy.
- **Verified claim check** — Two independent RPC providers must agree on the registry, the contract version, the pause flag and the record, at the finalized and the latest block. The downloaded payload must match the fingerprint stored on-chain.
- **Bound envelopes** — Envelope v2 binds every payload to its deployment, inheritance, testator, beneficiary and purpose, so a payload copied anywhere else does not decrypt.
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
│   ├── ExfiltrationVerification.pdf  # Key exfiltration verification protocol
│   └── TestatorManual.md
├── keys/                          # Directory for exported key files
├── scripts/
│   ├── utils/
│   │   ├── shared-utils.js        # Centralized utilities
│   │   ├── shared-definitions.js  # Payload fingerprint, deployment identity, envelope v2 context
│   │   ├── chain-reader.js        # Two-provider verified chain reads
│   │   ├── claim-context.js       # Claim check: registry, version, pause flag, record
│   │   ├── claim-config.js        # Environment, providers, key provider, Arweave gateways
│   │   ├── claim-flow.js          # The claim, step by step
│   │   ├── arweave.js             # Payload download, checked against the fingerprint
│   │   ├── envelope-v2.js         # Envelope v2 decryption (asset and metadata)
│   │   └── key-release.js         # Key provider release request v2 (EIP-712)
│   ├── Beneficiary_CheckClaimable.js
│   ├── Beneficiary_Claim.js
│   └── Testator.js
├── test/                          # node:test suite, shared vectors and mocks
├── .env.example                   # Environment variables template
├── .gitignore
├── README.md
├── WhitePaper.pdf                 # Project White Paper
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
- View all inheritances designated to your address, with the testator's name and message
- Check if specific inheritances are claimable at the finalized and the latest block (and potentially trigger state changes)
- Fund the beneficiary wallet, and refund unused ETH to your gas wallet

### 3. Beneficiary Claim Tool (`scripts/Beneficiary_Claim.js`)

For beneficiaries to claim and decrypt their inherited digital assets:
- Verify, through two independent providers, that the inheritance is Claimable at the finalized and the latest block on an unpaused v3 contract
- Download the encrypted asset from Arweave and check it against the payload fingerprint stored on-chain
- Request the wrapped key from the key provider with a signed release request
- Verify the inheritance again, then decrypt the asset (envelope v2) with your ML-KEM-768 key
- Save the decrypted file to your local system

No gas is needed to claim.

## Getting Started

Each tool has detailed installation and usage instructions in its corresponding manual:

- Testator Tool: See [Manuals/TestatorManual.md](Manuals/TestatorManual.md)
- Beneficiary Check Tool: See [Manuals/CheckClaimable.md](Manuals/CheckClaimable.md)
- Beneficiary Claim Tool: See [Manuals/ClaimManual.md](Manuals/ClaimManual.md)

### Prerequisites

- Node.js (v18.0.0 or higher)
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

### ML-KEM-768 Private Key Protection

The Inheritor system uses post-quantum cryptography (ML-KEM-768) for beneficiary key encryption. To verify that the iOS application does not exfiltrate your ML-KEM-768 private keys, see [Manuals/ExfiltrationVerification.pdf](Manuals/ExfiltrationVerification.pdf).

This document provides a user-verifiable protocol for detecting potential key exfiltration through network traffic analysis. Users can independently confirm that CloudFlare POST requests remain under 700 bytes (legitimate) versus the 2,400+ bytes required to exfiltrate an ML-KEM-768 private key—providing mathematically certain detection through simple packet size monitoring.


## How a Claim Is Verified

Nothing is decrypted unless every step passes:

1. **Registry.** The V2.1.0 address registry on Ethereum names the Inheritor contract for the chain (production `0xe33AB05Eef0d1803ca564C9a1DFaC6797853D3d2`, test `0x8743E613486Df310cC549cd57860c28c8438892E`). It must name the same, non-zero contract at the finalized and the latest block.
2. **Version.** The contract's `getVersion()` must report major version 3. A newer version asks you to update the tools; an older one is refused.
3. **Record.** At both blocks: the contract is not paused, the record exists and names you as beneficiary, it is `Claimable`, and it names the same parties and payload.
4. **Two providers.** Every read comes from two providers of different operators. They must agree on each block and on every result, byte for byte. Each call is pinned to the block hash. Block ages are checked against the providers' own clocks. Any disagreement stops the claim.
5. **Payload.** The payload downloaded from Arweave must match the record's `payloadFingerprint`. A gateway that serves anything else is skipped.
6. **Key release.** The key provider releases the wrapped key on an EIP-712 release request signed with your beneficiary key, once it sees the record Claimable at both blocks.
7. **Recheck and decrypt.** The record is verified again, then the asset is decrypted. Envelope v2 authenticates the deployment, inheritance, testator, beneficiary and purpose, so a payload copied from another record does not open.

A newly Claimable inheritance can be claimed once its block is finalized, about 15–20 minutes after it became Claimable.

## Configuration

The beneficiary tools read these optional variables from the environment or from `.env`:

| Variable | Default | Purpose |
|----------|---------|---------|
| `INHERITOR_ENVIRONMENT` | `production` | `production` or `test`. Selects the registry and the key provider. |
| `INHERITOR_ETHEREUM_RPCS` | publicnode, Tenderly, dRPC, bloXroute | Ethereum providers: comma-separated `Operator name=https://url` or bare URLs. |
| `INHERITOR_ARBITRUM_RPCS` | Offchain Labs, Tenderly, Blast, Nodies | Arbitrum providers, same format. |
| `INHERITOR_KEY_PROVIDER_URL` | `https://keyprovider-prod.inheritor.workers.dev` (test: `keyprovider-test`) | Key provider. |
| `INHERITOR_ARWEAVE_GATEWAYS` | `https://arweave.net,https://ar-io.net` | Arweave gateways, tried in order. |
| `INHERITOR_KEYS_DIR` | `./keys` | Directory with your exported key file. |

At least two providers of **different operators** must answer; extra providers replace ones that do not. Every claim reads Ethereum, because the registry is there. Provider URLs may contain API keys: the tools print only the host. The registry address is not configurable, because it is the trust anchor that names the contract.

## Tests

```bash
npm test
```

The suite uses Node's built-in test runner and needs no network. It reproduces the shared test vectors of the contract, the iOS app and the key provider, checks an envelope v2 vector, and runs the claim end to end against local mocks of two RPC providers, the key provider and Arweave. See [test/fixtures/README.md](test/fixtures/README.md) for where each vector comes from.

#### Shared Utilities Module

Location: `/scripts/utils/shared-utils.js`

This centralized module provides common functionality across all CLI management scripts: constants, contract ABIs (v3), formatting, provider setup for transactions, key file loading and wallet funding.

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