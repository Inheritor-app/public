# Test vectors

| File | Source | What it checks |
|------|--------|----------------|
| `shared-vectors.json` | SolidityAndDashboard `packages/contracts/spec/vectors.json` (`main` at 433ea6c), unchanged | Payload fingerprint and deployment identity, valid and invalid inputs |
| `envelope-aad-vector.json` | iOS app `UnitTests/ClaimabilityFixtures.swift`, `appVectors.envelopeAAD` (Inherit `main` at e3994ff) | Envelope v2 authenticated data for purpose `asset` and `metadata` |
| `key-release-vector.json` | key-provider `test/keyprovider/v2/fixtures/request-vectors.json` (`main` at ab5a388), release fields only | EIP-712 domain separator, `ReleaseKey` digest and RFC 6979 signature |
| `envelope-v2-vector.json` | Generated here by `generate-envelope-v2-vector.js` | Envelope v2 decryption of an asset (with a released wrappedK) and of metadata |

Copy the upstream files again when a definition changes there; never edit them here.

## Envelope v2 vector

No envelope v2 sealed by the app was available as a fixture, so this one is generated. It follows the app's sealing steps in `QSCryptionManager.encryptDataRecipient` (Inherit `main`) for the external ML-KEM-768 recipient, under the context of the app's `envelopeAAD` vector:

- **Content.** AES-256-GCM with the 32-byte envelope v2 authenticated data.
- **Key wrap.** HKDF-SHA256 with info `wrap|v=1|kid=<kid>|alg=AES-256-GCM`, then AES-GCM under `recV=1|kid=<kid>|type=mlkem768|kem_hash=<b64>|nonce=<b64>`.
- **Arweave copy.** The ML-KEM recipient's `wrappedK` is empty. The released wrappedK is stored separately, as the key provider would return it.

The X-Wing recipient is a placeholder, because node has no X-Wing implementation and the CLI never reads it.

**Throwaway keys.** The ML-KEM-768 key is derived from the public label in `mlkemKeySeedLabel`, as are every nonce, salt and content key. It never protects real data. `node test/fixtures/generate-envelope-v2-vector.js` rewrites the file identically, and the tests check that.

**Open.** An envelope sealed by the app itself (Swift `CryptoKit` and SwiftKyber) should be added as a cross-implementation vector when one is exported from the app's tests.
