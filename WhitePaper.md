# On-Chain Digital Inheritance

**Author:** aernoud@inheritor.app
**Website:** www.inheritor.app
**Date:** October 3, 2025

---

## Introduction

Inheritance has served as a cornerstone of wealth transfer across civilizations for millennia, evolving through codified law and institutional frameworks designed for physical property and paper records. Yet the emergence of digital assets—cryptocurrencies, encrypted files, online accounts, and digitized documents—challenges these centuries-old mechanisms in fundamental ways.

Traditional inheritance depends on intermediaries (attorneys, notaries, executors) who verify death and orchestrate asset transfers through documented procedures. This model functions adequately when assets exist as physical objects or institutional accounts where third parties can facilitate transfer. But digital assets that rely on cryptographic keys or access credentials break this paradigm: absolute secrecy is essential for security, yet that same secrecy makes institutional intermediation dangerous or impossible.

To understand the scope of this challenge, assets requiring inheritance fall into three distinct categories:

1. **Registry-bound assets where law mandates formal deeds** (real estate, titled vehicles, regulated securities)
2. **Institution-mediated assets without formal deed requirements** (online bank accounts, social media profiles, content channels, digital subscriptions, family keepsakes)
3. **Purely digital assets where access = ownership** (cryptocurrencies, encrypted files, private keys)

Traditional inheritance frameworks handle category 1 well, struggle with category 2, and fundamentally fail at category 3. The challenge lies in creating a system that can manage conditional access to encrypted information—releasing it to beneficiaries only after verifiable conditions are met, without depending on trusted custodians or reintroducing the centralization risks that digital systems were designed to eliminate.

This white paper introduces On-Chain Digital Inheritance as a solution to this cryptographic paradox, implemented through Inheritor's architectural time-lock* mechanism.

_* Patent Pending_

---

## The Problem of Inheritance in the Digital Age

Traditional inheritance frameworks were designed for physical property and paper records. They assume assets are mediated by registries, banks, or custodians who can be instructed to release them after death. Digital-native assets break this model.

Unexpected death or incapacitation can lead to the permanent loss of digital assets, as security protocols discourage sharing passwords and private cryptographic keys. Without access to these credentials, beneficiaries cannot retrieve wallets, accounts, or encrypted archives. Unlike property deeds, there is often no central registry or institution to reissue ownership—if the key is lost, the asset is gone forever.

Trustees and executors are also reluctant to handle digital assets:

- **Liability risk:** Possessing private keys effectively makes them custodians. Any mistake, loss, or theft could expose them to personal liability.
- **Instant mutability:** Digital assets can be transferred or drained in seconds. A trustee who holds a key cannot guarantee the estate will remain intact until probate is completed.
- **Ongoing change:** Passwords are rotated, private keys are re-generated, photos and documents are constantly added, accounts closed or migrated. A static snapshot (USB drive, printed seed phrase, sealed envelope) becomes outdated almost immediately, making "store and hand over" approaches unreliable.
- **Legal uncertainty:** Many jurisdictions still lack clear rules for fiduciaries managing digital wallets or accounts, leaving professionals unwilling to accept responsibility.

The result is a system fundamentally broken for digital assets. Traditional inheritance depends on third parties who can verify death and release assets accordingly, but digital assets require absolute key secrecy that makes such intermediation dangerous or impossible. Millions face an impossible choice: share keys with executors and risk theft or premature access, or keep them secret and risk permanent loss.

This practical impasse, however, stems from a deeper technical challenge rooted in the nature of cryptography itself.

### The Cryptographic Paradox of Conditional Access

The specific challenge of inheriting encrypted information in cryptographic systems presents a fundamental paradox: cryptography excels at keeping secrets from unauthorized parties, but struggles with conditional access for authorized parties. If a beneficiary possesses both a private decryption key and the corresponding ciphertext, cryptographic security guarantees immediate decryption capability. Once key material is disclosed to the intended recipient, delaying access until future conditions are met becomes architecturally impossible through cryptographic means alone. Standard encryption does not inherently support temporal controls or delayed-release mechanisms.

In blockchain-based systems, this paradox is particularly acute. Public blockchains store all data transparently and permanently. If encrypted assets and decryption keys are both available to the beneficiary from the outset, no cryptographic mechanism can enforce a time delay or conditional access—the beneficiary can decrypt immediately, bypassing inheritance conditions entirely.

Many prior solutions have attempted to enforce control by withholding a critical piece (i.e. enforcing scarcity), but in practice they also introduce trust, coordination, or centralization assumptions that limit their robustness:

- **Escrow and Custodial Models:** Solutions like Casa Covenant rely on trusted third parties (attorneys, key custody services) to hold assets until conditions are met. These approaches are fundamentally centralized, introducing single points of failure, ongoing operational costs, and requiring trust in institutions that may face regulatory changes, bankruptcy, or operational failures.

- **Secret Sharing Schemes:** Safe Haven Inheriti (Shamir's Secret Sharing) and Vault12 (guardian networks) distribute control among multiple parties, relying on human coordination and social trust. They are human-trust-bound, requiring beneficiaries to coordinate with other keyholders, creating potential for disputes, coercion, or unavailability of required signatories.

- **Dead-man Switches:** Services like Sarcophagus use automated triggers with decentralized storage, but still depend on external coordination mechanisms and trusted attestors to verify conditions, maintaining some degree of centralization.

- **Time-lock Puzzles and VDFs:** Cryptographic mechanisms that create resource-bound delays based on computational work. While mathematically elegant, they are inherently inflexible—the delay is fixed at creation time and cannot adapt to external conditions like the testator's actual status or changing circumstances.

- **DIY Solutions:** Hardware wallets in safes with seed phrases, passwords in sealed envelopes with lawyers, USB drives in safety deposit boxes, or encrypted files with keys split among family members. These approaches are fundamentally secrecy-bound and discovery-dependent, failing catastrophically when physical items are lost, damaged, stolen, or when technology becomes obsolete.

All these solutions reintroduce centralization, inflexibility, and trust dependencies that blockchain systems aim to eliminate.

Existing solutions face an inherent dilemma: they can either preserve decentralization by distributing all cryptographic materials to beneficiaries (enabling premature access), or enforce conditional access by withholding materials through trusted intermediaries (sacrificing decentralization).

**No existing solution achieves both simultaneously.**

To address this fundamental limitation, a new approach is needed—one that reconceptualizes inheritance itself.

---

## Defining On-Chain Digital Inheritance

On-Chain Digital Inheritance reconceptualizes inheritance, replacing traditional trust-dependent mechanisms with a cryptographically enforced, autonomous transfer of ownership.

At its core, On-Chain Digital Inheritance uses cryptography and blockchain-based smart contracts to create conditional access to encrypted assets. Assets become accessible to designated beneficiaries only when predefined conditions are met—conditions verified autonomously by blockchain infrastructure without requiring trusted intermediaries. The system separates asset ownership (who ultimately receives the inheritance) from access control (when they can claim it), enforcing this separation through programmable, verifiable logic rather than institutional gatekeepers.

This approach differs markedly from "digital inheritance" in its usual sense: the posthumous transfer or access of digital assets (e.g. accounts, keys, credentials), often facilitated via password-vault services or digital wills. Those approaches simply move the same centralized, trust-dependent model online. On-Chain Digital Inheritance, by contrast, is truly autonomous: no institution holds your keys, no company needs to stay in business for decades, no recurring subscription fees exist. The inheritance operates through public blockchain infrastructure that anyone can verify and no one can shut down.

The model covers all three asset categories established in the Introduction: purely digital assets, registry-bound assets, and institution-mediated assets. For registry-bound assets requiring legal documentation, On-Chain Digital Inheritance can securely release authenticated deeds to beneficiaries. Where jurisdictions recognize digital signatures and blockchain records as legally binding (such as under eIDAS in the EU or ESIGN/UETA in the US), Inheritor's cryptographic proof of authorship, acceptance, and condition fulfillment may satisfy legal requirements directly—potentially eliminating the need for traditional notarization or attorney involvement. Where such recognition is not yet established, the system integrates with traditional legal frameworks by releasing professionally prepared documents automatically.

However, realizing this vision requires solving the cryptographic paradox that has prevented previous attempts at truly decentralized On-Chain Digital Inheritance.

---

## Inheritor's Solution: The Architectural Time-Lock*

The cryptographic paradox of conditional access has been well documented in academic literature—including Prost's _Inheritance and Blockchain: Thoughts and Open Questions_ (2022), _Research on Decentralized Digital Inheritance_, _Beyond Life: A Digital Will Solution for Posthumous Data Management_ (2025), and _Toward Timed-Release Encryption in Web3_. These works consistently identify a fundamental tension: purely decentralized systems struggle to enforce conditional or event-based access (e.g., "release after death" or "release after time-delay") without reintroducing external trust mechanisms such as oracles, governance votes, or key custodians.

For the first time, Inheritor resolves this paradox through a novel architectural time-lock* mechanism.

Beneficiaries receive complete cryptographic materials—both classical secp256k1 keys for blockchain operations and quantum-safe private keys for asset decryption—from the moment the inheritance is created. All encrypted assets, metadata, and key encapsulation data are stored publicly on Arweave and Ethereum, fully accessible to the beneficiary. Yet premature decryption is architecturally impossible. The enforcement emerges from binding key usability—not key possession—to blockchain-verified state.

On iOS, quantum-safe private keys are generated using platform APIs that prevent extraction, with the root-of-trust anchored in Apple Silicon's Secure Enclave. The keys exist on-device and sync via iCloud Keychain, protected by Secure Enclave hardware that encrypts all Keychain data using device-bound keys that never leave the secure processor. Apple's CryptoKit API provides no method to export raw key material, creating layered protection where both the API design and hardware-backed encryption work in concert to make key extraction architecturally impossible.

The Inheritor application acts as gatekeeper, verifying smart contract state (Designated → Claimable → Claimed) before authorizing any decryption operation using these protected keys. Even if malicious code were introduced, the platform-level constraints prevent key exfiltration, and the publicly observable blockchain state ensures transparent verification of inheritance conditions.

This fundamentally differs from traditional key-withholding approaches: beneficiaries possess all required cryptographic materials, yet the architecture ensures those materials remain inert until verifiable on-chain conditions are satisfied.

This breakthrough creates tangible benefits for users:

- **Complete Transparency:** The system operates entirely through public infrastructure with no hidden intermediaries or private channels. Beneficiaries can independently verify that their inheritance setup uses only observable public blockchain infrastructure, eliminating dependencies on services that could fail, change terms, or require ongoing trust.

- **True Independence:** No institutional dependencies or third-party custody arrangements are required. The inheritance operates autonomously through smart contracts, freeing users from reliance on banks, attorneys, or specialized services that may face regulatory changes, business failures, or operational disruptions.

- **Long-Term Durability:** The system can operate across decades requiring only public blockchain infrastructure to remain available—no specific company or service needs to stay in business. This multi-generational resilience ensures that inheritances created today will remain accessible to beneficiaries decades into the future, regardless of corporate lifecycles or market changes.

- **Verifiable Security:** Rather than asking users to trust promises, the architecture makes violations architecturally impossible or immediately detectable. For iOS users, the entire inheritance process operates through public infrastructure—network monitoring confirms communication only with Ethereum and Arweave, with no hidden API calls or secret data channels. Everything operates publicly except private keys, which iOS platform security prevents the app from accessing, even from the beneficiary.

  The audit path is simple: observe network traffic to verify only public blockchain and storage connections with documented data formats. The architecture resists compromise even from malicious insiders or developers, providing security guarantees that can be independently verified rather than simply trusted.

**What does this mean in practice?**

With Inheritor, users can secure their digital legacy without trusting banks or attorneys to hold keys, without paying recurring custody fees, and without depending on any company staying in business for decades. For cryptocurrency wallets specifically, users encrypt their private keys using quantum-safe encryption with beneficiaries designated from the outset. The encrypted materials are stored publicly on blockchain infrastructure where they cannot be lost or destroyed—eliminating the physical vulnerabilities of hardware wallets or paper seed phrases—while iOS platform security prevents the app or even the beneficiary from extracting usable key material until smart contract conditions verify the inheritance is claimable.

This maintains the same 'never expose your keys' security standard while removing the risk of loss, theft, or premature access through discovery. The inheritance setup combines cryptographic certainty—the math guarantees assets remain secure—with programmable flexibility through smart contracts that execute exact intentions. Everything operates transparently through public infrastructure that can be independently verified, giving users full control over their digital estate while ensuring beneficiaries have guaranteed access when the time comes, regardless of institutional changes, market conditions, or corporate lifecycles.

While the architectural time-lock* mechanism has broad applicability—from time-locked release of confidential information and corporate succession planning to whistleblower dead-man switches, escrow arrangements, and conditional access to medical or legal records—Inheritor specifically deploys this technology to solve the inheritance challenge in the digital age. Where other conditional access scenarios may emerge over time, the need for secure, trustless On-Chain Digital Inheritance is immediate and universal, affecting anyone who holds digital assets and wants to ensure their beneficiaries can access them.

_* Patent Pending_

This architectural breakthrough solves the theoretical challenge, but practical deployment requires careful attention to blockchain infrastructure and user experience.

---

## Building a Solution for the Ages

Turning the concept of On-Chain Digital Inheritance into a practical application requires careful attention to blockchain infrastructure, permanent storage, condition verification, user experience, and multi-generational resilience. Inheritor addresses each of these systematically.

### Flexible Blockchain Strategy: Security or Cost Efficiency

Inheritor offers users a choice between Ethereum Layer 1 and Arbitrum for each inheritance they create. Ethereum L1 provides maximum security and decentralization—ideal for high-value assets (cryptocurrency wallets, property deeds) or inheritances where permanence on the most secure layer matters regardless of monetary value (legal documents, irreplaceable records). Arbitrum reduces fees by over 90% through Optimistic Rollups, making it suitable for lower-stakes inheritances (family photos, password lists, social media accounts) while still leveraging Ethereum's security through fraud proofs and 7-day dispute windows. Users can mix and match blockchains across their inheritances, optimizing each transfer based on the specific asset's value, nature, and criticality. (Note: Cardano integration is on our roadmap.)

### Permanent Decentralized Storage with Quantum-Safe Encryption

Inheritor leverages Arweave for decentralized, permanent asset storage. Arweave's "pay once, store forever" model eliminates recurring fees while ensuring data permanence through its append-only Blockweave architecture. All assets are encrypted using X-Wing quantum-safe cryptography (iOS 26+), protecting inheritances against future quantum computing threats across generations. This combination creates true multi-generational security: permanent storage with cryptographic protection that remains effective regardless of technological advances.

### Condition Verification: Automated Check-Ins with Optional Human Oversight

The architectural time-lock enforces conditional access through smart contract verification—but how does the system determine when conditions are met without depending on centralized death verification services or institutional attestors? Inheritor implements a check-in mechanism with optional human verification.

Testators confirm their wellbeing through periodic check-ins—a simple interaction taking less than 10 seconds. Missed check-ins trigger a grace period that is independently configurable for each inheritance, enabling precise control over asset release timing. One inheritance might expire 30 days after the final check-in, releasing immediate necessities to beneficiaries, while another might remain locked for a year or longer, deferring access to certain assets until beneficiaries are ready to manage them. When each inheritance's grace period expires, the smart contract automatically updates that inheritance's state to claimable, authorizing beneficiary access. This per-inheritance timing operates entirely through the testator's blockchain interaction, requiring no external verification infrastructure.

For additional protection against accidental expiration, testators can optionally designate a beneficiary as a verifier. A verifier is a beneficiary who receives their own designated inheritance and must also confirm the testator's condition before inheritances become claimable. This dual-role design creates natural incentive alignment: verifiers have direct stake in ensuring accurate verification. Testators assign verifier status through blockchain transactions and can enable or disable verification requirements at any time.

When check-ins are missed and verification is enabled, verifiers can query the smart contract state through the Inheritor application to discover verification requests. Verifiers assess whether the testator is truly incapacitated or merely traveling, ill, or temporarily unavailable, then submit their attestation as an on-chain transaction. This design involves an explicit trade-off: adding human judgment provides protection against premature claiming due to technical issues or temporary unavailability, but introduces a trust assumption that verifiers will act honestly. Testators choose this trade-off for themselves—opting for either purely automated, trustless execution based solely on check-in timing, or adding a human verification layer that introduces trust in exchange for additional safeguards against accidental expiration.

### Seamless User Experience Through Account Abstraction

Inheritor eliminates blockchain complexity through ERC-4337 account abstraction. Gas fees are covered by a paymaster and recovered through in-app purchases—users never need to hold ETH. On-chain actions feel like standard iOS interactions while maintaining verifiable execution. Importantly, the underlying smart contracts remain accessible via traditional externally owned accounts, ensuring infrastructure independence if the app becomes unavailable.

### Resilience Through Dual-Recipient Architecture

While Inheritor's iOS implementation offers zero infrastructure dependencies beyond Ethereum and Arweave, multi-generational accessibility requires insurance against platform evolution. Each inheritance is encrypted for two quantum-safe recipients: one using iOS platform encryption (X-Wing) with non-exportable keys for full architectural time-lock enforcement, and one using portable ML-KEM-768 encryption with exportable keys. Both paths provide quantum resistance. The portable path uses a lightweight conditional release service (Cloudflare Worker) that verifies smart contract conditions before releasing key material—a minimal infrastructure dependency that ensures access even if iOS or the Inheritor app becomes unavailable.

Both paths enforce identical security policies through the same smart contract conditions and cryptographic binding. True decentralization emerges from redundant access methods and open asset formats rather than any single application. This dual-path design ensures inheritances remain accessible across generations regardless of corporate decisions or platform changes.

Together, these implementation choices—flexible blockchain deployment, permanent quantum-safe storage, automated condition verification, abstracted user interaction, and resilient dual-path access—create a system that is secure, affordable, and accessible across generations.

---

## The Path to Frictionless Inheritance

Inheritor's ultimate vision is a world where inheritance of all assets—whether native digital (cryptocurrencies, encrypted files), tokenized (NFTs, real-world assets on-chain), digitized representations (deeds, titles, certificates), or personal instructions—flows to beneficiaries with equal ease and certainty. No asset class requires different mechanisms, special intermediaries, or complex procedures. With Inheritor the required technology exists today: Inheritor can already encrypt and conditionally release any document with blockchain-enforced timing. As legal frameworks evolve to recognize cryptographically authenticated transfers alongside traditional notarization, the inheritance landscape will transform.

Where traditional inheritance currently requires executors, notaries, physical documents, and coordination across multiple parties, the future envisioned by Inheritor enables complex asset transfers with the same reliability and simplicity as blockchain-native tokens. A house deed transfers as smoothly as ETH; family heirlooms with detailed instructions move as seamlessly as an NFT. This represents the true democratization of inheritance: transforming historically complex, paper-dependent processes into automated, verifiable transfers that execute with digital precision—available to anyone, anywhere.

---

## Conclusion

For the first time in history, inheritance can operate without institutional intermediaries, custody dependencies, or trust requirements. The architectural time-lock* mechanism resolves a fundamental cryptographic paradox that has prevented truly decentralized conditional access systems—enabling beneficiaries to possess all required cryptographic materials from day one while ensuring those materials remain architecturally inert until verifiable on-chain conditions are satisfied.

This breakthrough has immediate, practical implications. Cryptocurrency holders can secure their digital wealth with greater safety than hardware wallets while guaranteeing beneficiary access. Families can protect login credentials, encrypted files, and personal instructions without trusting third parties. Legal documents and property deeds can be released automatically when conditions are met, integrating with—rather than replacing—traditional legal frameworks.

On-Chain Digital Inheritance operates through public blockchain infrastructure that anyone can verify and no one can shut down. Inheritances created today will execute decades into the future, regardless of corporate lifecycles, regulatory changes, or institutional failures. This is inheritance reimagined: programmable, autonomous, and accessible to anyone, anywhere.

Beyond the technical innovation, Inheritor transforms inheritance planning from a daunting institutional process into a profound act of care that anyone can perform. Creating a Digital Will—the complete set of inheritances designated for loved ones—becomes as simple as using your phone from home, requiring no attorneys, notaries, or complex procedures. There is no longer any excuse to postpone this essential preparation. Every cryptocurrency wallet, every cherished photo collection, every important credential can be secured for those you leave behind—not as a distant obligation requiring professional assistance, but as an ongoing expression of responsibility and love, maintained with the same ease as managing any other aspect of your digital life.

_* Patent Pending_

---

## Acknowledgments

We would like to thank the open-source and AI community and the developers of the technologies utilized in this project. Their contributions have been invaluable in enabling the development of Inheritor.

---

## Contact Information

For more information about Inheritor or to contribute to the project, please contact:

- Email: aernoud@inheritor.app
- Website: www.inheritor.app

---

## Disclaimer

This white paper is for informational purposes only and does not constitute legal, financial, or investment advice. Users should consult with professional advisors before making any decisions based on the information provided.
