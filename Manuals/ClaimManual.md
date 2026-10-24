# Inheritor Beneficiary Claim Tool
## User Manual

For Inheritor contract v3 and envelope v2.

## Table of Contents
1. [Introduction](#introduction)
2. [Before You Begin](#before-you-begin)
3. [Installation](#installation)
4. [Running the Tool](#running-the-tool)
5. [Understanding Each Step](#understanding-each-step)
6. [Configuration](#configuration)
7. [Technical Background](#technical-background)
8. [Troubleshooting](#troubleshooting)
9. [Security Considerations](#security-considerations)
10. [Related Tools](#related-tools)

## Introduction

The Inheritor Beneficiary Claim Tool lets a beneficiary claim a digital inheritance without the iOS app. It uses post-quantum cryptography (ML-KEM-768), so the inheritance stays protected against future quantum computers.

The tool combines three services:
- **Smart contract (v3)** on Ethereum or Arbitrum: stores the inheritance record, its Arweave transaction ID and the fingerprint of the encrypted payload.
- **Arweave**: stores the encrypted asset.
- **Key provider**: releases your wrapped key once the inheritance is Claimable, on a request signed with your beneficiary key.

With this tool, you can:
- Verify, through two independent providers, that the inheritance is Claimable
- Download the encrypted asset and check it against the fingerprint stored on-chain
- Retrieve your wrapped key from the key provider
- Decrypt the asset and save it to your computer

Nothing is decrypted unless every check passes. Claiming needs **no gas**: the tool only reads the blockchain.

**Note**: If the inheritance is not Claimable yet, use the Beneficiary Check Tool first. It can send the `isClaimable` transaction that makes it Claimable.

## Before You Begin

Before using this tool, you'll need:

1. **Exported key file**: the `InheritorKeys_YYYY-MM-DD.json` file exported from the Inheritor iOS app. It holds your beneficiary Ethereum key and your ML-KEM-768 quantum-safe key.
2. **Inheritance ID**: the ID of the inheritance you want to claim.
3. **Network**: whether the inheritance is on Ethereum or Arbitrum.
4. **Internet connection**: to reach the RPC providers, Arweave and the key provider.

The inheritance must be **Claimable at both the finalized and the latest block**. A newly Claimable inheritance can be claimed about 15–20 minutes later, once its block is finalized.

## Installation

### Installing Node.js (Required)

This tool requires Node.js 18 or higher, which is NOT included by default in macOS, Windows, or Linux systems:

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

1. Download or clone this repository.
2. Open a terminal in the repository folder and install the dependencies:

```bash
npm install
```

3. Place your exported `InheritorKeys_YYYY-MM-DD.json` file in the `keys/` folder. If there are several, the most recent one is used.
4. Check that Node.js is installed correctly:

```bash
node --version
```

This should display v18.0.0 or higher.

5. Optionally, run the test suite. It needs no network:

```bash
npm test
```

## Running the Tool

To start the tool, run:

```bash
node scripts/Beneficiary_Claim.js
```

### Steps

1. **Keys are loaded** from the `keys/` folder. The tool shows your beneficiary address.
2. **Select network**: type `1` for Ethereum or `2` for Arbitrum.
3. **Enter the inheritance ID**: the complete ID starting with `0x` (66 characters).
4. **Wait**: the tool runs the checks below and prints each result.
5. **File saved**: the decrypted file is saved in the current folder as `inheritance_<first 8 characters of the ID>.<extension>`. An existing file with that name is never overwritten.

## Understanding Each Step

### 1. Verified claim check

- **Registry.** The Inheritor address registry on Ethereum names the contract for your network. It must name the same contract at the finalized and the latest block.
- **Version.** The contract must report major version 3. A newer contract shows "Please download the latest recovery tools"; an older one is refused.
- **Record.** At both blocks:
  - the contract is not paused;
  - the record exists and names you as beneficiary;
  - it is Claimable;
  - it names the same testator, beneficiary and payload.
- **Two providers.** Every read comes from two RPC providers run by different operators. They must agree on each block and on every result, and each call is pinned to the block's hash. The blocks must be recent, judged by the providers' own clocks. Any disagreement stops the claim.

### 2. Download and check the payload

- The encrypted asset is downloaded from Arweave using the transaction ID in the record.
- Its fingerprint must equal the `payloadFingerprint` stored on-chain. If a gateway serves anything else, the next gateway is tried; nothing is decrypted from a payload that does not match.

### 3. Key release

- The claim check runs again first, so a check-in, revocation or pause during the download stops the claim before anything is signed.
- The tool signs a release request (EIP-712, domain "Inheritor Key Provider", version 2) with your beneficiary key. The request names the deployment, the inheritance, you, the payload fingerprint and the current time.
- The key provider checks the request and the chain itself, then returns your wrapped key. It only does so when the record is Claimable at both the finalized and the latest block.

### 4. Recheck and decrypt

- The claim check runs again, so a check-in, revocation or pause in the meantime stops the claim. Decryption must follow within 30 seconds of that check.
- Your ML-KEM-768 key unwraps the content key, and the content key decrypts the asset. If a gateway's copy does not open (the fingerprint does not cover the envelope's recipient data), the next gateway's copy is tried with the same key. Envelope v2 authenticates the record the asset belongs to: the deployment, inheritance, testator, beneficiary and purpose. A payload copied from another record does not open.

## Configuration

The defaults work for most people. To change them, set these variables in your environment or in a `.env` file in the repository folder:

| Variable | Default | Purpose |
|----------|---------|---------|
| `INHERITOR_ENVIRONMENT` | `production` | `production` or `test` |
| `INHERITOR_ETHEREUM_RPCS` | four public providers | Ethereum providers: `Name=https://url,Name=https://url` |
| `INHERITOR_ARBITRUM_RPCS` | four public providers | Arbitrum providers, same format |
| `INHERITOR_KEY_PROVIDER_URL` | the environment's key provider | Key provider base URL |
| `INHERITOR_ARWEAVE_GATEWAYS` | `https://arweave.net,https://ar-io.net` | Arweave gateways, tried in order |
| `INHERITOR_KEYS_DIR` | `keys/` | Folder with your key file |

Notes on providers:
- At least two providers of **different operators** must answer. Two entries with the same name, or with hosts under the same domain (such as `eth.example.com` and `lb.example.com`), count as one.
- An Arbitrum claim needs Ethereum providers too, because the registry is on Ethereum.
- Your own provider URLs (Infura, Alchemy and so on) may contain an API key. The tool prints only the host.

Example with your own providers:

```
INHERITOR_ETHEREUM_RPCS=Infura=https://mainnet.infura.io/v3/<key>,Alchemy=https://eth-mainnet.g.alchemy.com/v2/<key>
```

## Technical Background

### Key Terms

#### Inheritance ID
- A unique 32-byte identifier for each inheritance: `0x` followed by 64 hexadecimal characters.

#### Finalized and latest block
- The **latest** block is the newest one. Checking it makes a testator's check-in count within seconds.
- The **finalized** block can no longer be reversed. Checking it keeps a chain reorganisation from undoing the deadline. It lags the latest block by about 15–20 minutes.

#### Payload fingerprint
- `keccak256(abi.encode("INHERITOR_PAYLOAD_FP_V1", nonce, ciphertext, tag))` over the encrypted asset's content fields.
- Stored on-chain when the inheritance is created. It proves the downloaded file is the one the testator registered.

#### Deployment identity
- `keccak256(abi.encode("INHERITOR_DEPLOYMENT_V1", environment, chainId, contract))`.
- Identifies one Inheritor deployment. It separates Ethereum from Arbitrum, production from test, and one contract from any other.

#### Envelope v2
- The encrypted file format. The asset is encrypted once with AES-256-GCM under a random content key, which is then wrapped separately for each recipient.
- The asset encryption authenticates `keccak256(abi.encode("INHERITOR_ENVELOPE_V2", deploymentIdentity, inheritanceId, testator, beneficiary, purpose))`. The purpose is `asset` for the inherited file and `metadata` for the testator's name and message.
- Only envelope version 2 is supported.

#### ML-KEM-768
- The NIST-standardized post-quantum key encapsulation mechanism (formerly CRYSTALS-Kyber).
- 2400-byte private keys and 1184-byte public keys. It protects your copy of the content key.

### Cryptographic Process

1. **ML-KEM-768 decapsulation**: your private key recovers a shared secret from the capsule in the envelope.
2. **HKDF-SHA256**: derives the key-encryption key, with info `wrap|v=1|kid=<kid>|alg=AES-256-GCM`.
3. **Key unwrap**: AES-256-GCM opens the wrapped content key from the key provider, with authenticated data `recV=1|kid=<kid>|type=mlkem768|kem_hash=<hash>|nonce=<nonce>`.
4. **Asset decryption**: AES-256-GCM opens the asset with the envelope v2 authenticated data of this record.

### Inheritance States

- **Designated** (Green): not yet claimable, waiting for conditions to be met
- **Claimable** (Yellow/Orange): ready to be claimed by the beneficiary
- **Claimed** (Blue): already claimed by the beneficiary
- **Revoked** (Red): cancelled by the testator
- **Purged** (Gray): removed from the system

## Troubleshooting

#### "Claimable at the latest block but not yet at the finalized block"
- **Cause**: the inheritance became Claimable recently.
- **Solution**: try again in about 15–20 minutes.

#### "This inheritance is Designated, not Claimable"
- **Cause**: the deadline has not passed, or nobody has sent the `isClaimable` transaction yet.
- **Solution**: use the Beneficiary Check Tool (option 2) to check, and to send the transaction once the deadline has passed.

#### "independent providers answered" or "providers disagree"
- **Cause**: fewer than two independent providers were reachable, or they returned different answers.
- **Solution**: try again later, or set your own providers (see [Configuration](#configuration)). If providers keep disagreeing, do not continue: one of them may be returning false data.

#### "the providers do not agree on the current time"
- **Cause**: a provider sent no HTTP `Date` header, or its clock differs by more than 30 seconds from the other's.
- **Solution**: use other providers.

#### "block is ... s old"
- **Cause**: a provider is behind the chain.
- **Solution**: try again, or use other providers.

#### "newer Inheritor contract than this tool supports"
- **Cause**: Inheritor has been upgraded.
- **Solution**: download the latest version of these tools.

#### "maintenance"
- **Cause**: the registry names no contract for this network, for example during an upgrade.
- **Solution**: try again later.

#### "The Inheritor contract is paused"
- **Cause**: the contract's emergency pause is on.
- **Solution**: claims are possible once it is resumed.

#### "The payload downloaded from Arweave does not match the fingerprint stored on-chain"
- **Cause**: no gateway served the registered file.
- **Solution**: try again later, or add another gateway with `INHERITOR_ARWEAVE_GATEWAYS`.

#### Key provider errors
- **"not see the inheritance as Claimable"**: the key provider checks the finalized block too. Try again in about 15–20 minutes.
- **"rate limiting"**: wait for the time shown, then try again.
- **"rejected the request signature or its timestamp"**: check that your computer's clock is correct.
- **"has no key for this inheritance"**: check the inheritance ID, the network and `INHERITOR_ENVIRONMENT`.

#### "The wrapped key does not open with your quantum key"
- **Cause**: the key file is not the one of this inheritance's beneficiary.
- **Solution**: use the key file exported from the device the inheritance was designated to. Check that the quantum private key is the full 2400-byte key.

#### "Your keys are not the beneficiary of this inheritance"
- **Cause**: the key file belongs to another beneficiary address.
- **Solution**: use the right key file.

### When to Seek Help

If you encounter persistent errors not covered above, please:
1. Take note of the exact error message (set `DEBUG=1` to see the error code)
2. Do not share your key file or private keys with anyone
3. Contact official support channels

## Security Considerations

- **Use on a Secure Device**: Run the tool on a private, secure computer
- **Network Security**: Prefer a trusted network connection
- **Protect Your Key File**: It holds your beneficiary and quantum-safe private keys. Never share it.
- **Providers**: The two-provider rule means one dishonest provider cannot make an inheritance look Claimable. Use providers you trust.
- **Temporary Use**: This is a specialized tool, not for regular use
- **File Storage**: Move claimed files to a secure location after decryption

## Related Tools

The Inheritor CLI Tools suite includes three complementary command-line applications:

1. **Testator CLI Management Tool**: For testators to manage their Digital Will
2. **Beneficiary Check Tool**: For beneficiaries to monitor and check claimability of inheritances
3. **Beneficiary Claim Tool** (this tool): For beneficiaries to claim and decrypt inherited digital assets

If you're unsure whether your inheritance is claimable, use the Beneficiary Check Tool first.

---

**Disclaimer**: This tool is provided for claiming inheritances only. While efforts have been made to ensure its security and accuracy, use it at your own risk.
