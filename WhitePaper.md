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

Traditional inheritance frameworks handle category 1 well, struggle with category 2, and fundamentally fail at category 3. Yet these categories are not as distinct as they appear: blockchain tokenization—the process of creating digital representations of assets on distributed ledgers—offers a universal mechanism that can handle all three. Tokenization transforms any asset, whether physical deeds, digital credentials, or cryptocurrency wallets, into a programmable on-chain representation that can be transferred according to verifiable conditions.

The challenge lies not in tokenization itself—blockchain excels at creating digital asset representations—but in enforcing conditional transfers without trusted intermediaries. How can beneficiaries receive tokenized assets only after verifiable conditions are met, without depending on custodians or reintroducing the centralization risks that blockchain technology was designed to eliminate?

This white paper introduces On-Chain Digital Inheritance as the solution: tokenization of assets with conditional transfer enforcement through Inheritor's architectural time-lock* mechanism. For the first time, inheritance operates through pure blockchain infrastructure—no escrow services, no custody arrangements, no trust dependencies.

_* Patent Pending_

---

## The Problem of Inheritance in the Digital Age

Traditional inheritance systems were designed centuries ago for physical property transfers within stable institutional frameworks. Yet these mechanisms fail to serve the majority of the world's population effectively.

**Accessibility Barriers:** High legal costs make professional estate planning unaffordable for most families. Complex paper-based processes require specialized knowledge and institutional access. The majority of people worldwide—especially in developing countries—die without any Will, leaving assets in legal limbo and families without clear inheritance rights.

**Trust Dependencies:** Notaries and attorneys act as gatekeepers, introducing costs and potential corruption. Institutional intermediaries must remain solvent and trustworthy across decades—a precarious assumption in unstable jurisdictions. Cross-border inheritance faces jurisdictional complexity and institutional coordination challenges that often prove insurmountable.

**Inflexibility:** Updating Wills requires repeating expensive legal procedures. Life changes—new assets, additional beneficiaries, shifting circumstances—create friction that discourages timely updates. Disputes about legal capacity, document authenticity, or interpretation delay transfers for years.

**Digital Age Disconnect:** Systems designed for physical deeds and paper records struggle with digital credentials and encrypted assets. Traditional frameworks provide no mechanism for conditional access to information that updates continuously. Institutional intermediaries cannot safely hold cryptographic keys or manage digital-native assets without becoming points of failure.

These failures affect all three asset categories established in the Introduction—registry-bound assets, institution-mediated assets, and purely digital assets. Blockchain tokenization offers a universal mechanism to represent any asset digitally and enable programmable transfers. Yet inheritance introduces a unique challenge: conditional transfer. Unlike immediate ownership transfers, inheritance requires tokens to remain inaccessible to beneficiaries until verifiable conditions are met. Existing approaches to conditional access—custodial escrow, multi-signature coordination, time-lock puzzles—reintroduce the same institutional dependencies and trust requirements that tokenization was designed to eliminate.

This practical impasse stems from a deeper technical challenge rooted in the nature of cryptography itself.

---

## The Cryptographic Paradox of Conditional Access

Tokenization enables digital representation of any asset on blockchain infrastructure, but conditional transfer—the core requirement for inheritance—presents a fundamental cryptographic paradox. The challenge: how can a beneficiary possess a token representing an asset while being prevented from accessing that asset until verifiable conditions are met?

In traditional tokenization, possession equals capability. If a beneficiary holds the cryptographic keys to access a tokenized asset, they can access it immediately. Standard encryption does not inherently support temporal controls or conditional-release mechanisms. Once key material exists on-device or in a wallet, cryptographic security guarantees immediate access capability—delaying that access until future conditions are met becomes architecturally impossible through cryptographic means alone.

In blockchain-based systems, this paradox is particularly acute. Public blockchains store all data transparently and permanently. If tokenized assets (encrypted representations) and decryption keys are both available to the beneficiary from the outset, no cryptographic mechanism can enforce conditional access—the beneficiary can activate the token immediately, bypassing inheritance conditions entirely.

Many prior solutions have attempted to enforce control by withholding critical components (enforcing scarcity of key material), but in practice they introduce trust, coordination, or centralization assumptions that limit their robustness:

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

On-Chain Digital Inheritance applies blockchain tokenization to the inheritance challenge: creating digital representations of any asset with cryptographically enforced conditional transfer to designated beneficiaries.

At its core, the system tokenizes assets—whether physical deeds, digital credentials, or cryptocurrency wallets—by encrypting them and storing the encrypted representations on permanent decentralized infrastructure (Arweave). Smart contracts on Ethereum track ownership and access rights, enabling beneficiaries to claim their tokenized inheritance only when predefined conditions are verifiably met. The system separates token possession (beneficiaries receive all cryptographic materials immediately) from token activation (the ability to decrypt and access the underlying asset), enforcing this separation through programmable blockchain logic rather than institutional gatekeepers.

This approach differs markedly from "digital inheritance" in its usual sense: posthumous transfer of digital assets facilitated via password-vault services or digital wills. Those approaches simply move centralized, trust-dependent models online. On-Chain Digital Inheritance, by contrast, leverages pure blockchain tokenization: no institution holds your keys, no company needs to stay in business for decades, no recurring custody fees exist. Inheritance operates through public blockchain infrastructure that anyone can verify and no one can shut down.

The tokenization model covers all three asset categories established in the Introduction universally. Registry-bound assets, institution-mediated assets, and purely digital assets all undergo identical processing: encryption, permanent storage, on-chain representation, and conditional access enforcement. For registry-bound assets requiring legal documentation, tokenized deeds are released to beneficiaries when smart contract conditions are met. Where jurisdictions recognize digital signatures and blockchain records as legally binding (such as under eIDAS in the EU or ESIGN/UETA in the US), Inheritor's cryptographic proof of authorship, acceptance, and condition fulfillment may satisfy legal requirements directly—potentially eliminating traditional notarization. Where such recognition is not yet established, the system integrates with traditional legal frameworks by automatically releasing professionally prepared documents.

However, realizing this tokenization vision requires solving the cryptographic paradox that has prevented truly decentralized conditional token transfers.

---

## Inheritor's Solution: The Architectural Time-Lock*

The cryptographic paradox of conditional access has been well documented in academic literature—including Prost's _Inheritance and Blockchain: Thoughts and Open Questions_ (2022), _Research on Decentralized Digital Inheritance_, _Beyond Life: A Digital Will Solution for Posthumous Data Management_ (2025), and _Toward Timed-Release Encryption in Web3_. These works consistently identify a fundamental tension: purely decentralized systems struggle to enforce conditional or event-based access without reintroducing external trust mechanisms such as oracles, governance votes, or key custodians.

This same paradox has limited blockchain tokenization to immediate-access scenarios. Existing tokenization solutions assume possession equals activation—if you hold the keys to a token, you can use it immediately. Conditional token transfers have required custodians, escrow services, or trust assumptions that undermine blockchain's core value proposition.

While custodial escrows, time-lock puzzles, and multi-signature schemes have addressed conditional access in limited contexts, none achieve simultaneous elimination of private channels, trustless verification, and infrastructure independence—the combination that enables true conditional tokenization.

For the first time, Inheritor resolves this paradox through a novel architectural time-lock* mechanism, enabling truly trustless conditional tokenization.

Beneficiaries receive complete tokenized inheritance materials—both classical secp256k1 keys for blockchain operations and quantum-safe private keys for asset decryption—from the moment the inheritance is created. All encrypted assets, metadata, and key encapsulation data are stored publicly on Arweave and Ethereum, fully accessible to the beneficiary. The token exists in the beneficiary's possession from day one. Yet token activation (premature decryption and access) is architecturally impossible. The enforcement emerges from binding key usability—not key possession—to blockchain-verified state.

On iOS, quantum-safe private keys are generated using platform APIs that prevent extraction, with the root-of-trust anchored in Apple Silicon's Secure Enclave. The keys exist on-device and sync via iCloud Keychain, protected by Secure Enclave hardware that encrypts all Keychain data using device-bound keys that never leave the secure processor. Apple's CryptoKit API provides no method to export raw key material, creating layered protection where both the API design and hardware-backed encryption work in concert to make key extraction architecturally impossible.

The Inheritor application acts as gatekeeper, verifying smart contract state (Designated → Claimable → Claimed) before authorizing any decryption operation using these protected keys. Even if malicious code were introduced, the platform-level constraints prevent key exfiltration, and the publicly observable blockchain state ensures transparent verification of inheritance conditions.

This fundamentally differs from traditional key-withholding approaches: beneficiaries possess the complete token—all required cryptographic materials—yet the architecture ensures the token remains inert until verifiable on-chain conditions are satisfied. This is tokenization with a critical innovation: possession without premature activation.

This breakthrough in conditional tokenization creates tangible benefits for users:

- **Complete Transparency:** The system operates entirely through public infrastructure with no hidden intermediaries or private channels. Beneficiaries can independently verify that their inheritance setup uses only observable public blockchain infrastructure, eliminating dependencies on services that could fail, change terms, or require ongoing trust.

- **True Independence:** No institutional dependencies or third-party custody arrangements are required. The inheritance operates autonomously through smart contracts, freeing users from reliance on banks, attorneys, or specialized services that may face regulatory changes, business failures, or operational disruptions.

- **Long-Term Durability:** The system can operate across decades requiring only public blockchain infrastructure to remain available—no specific company or service needs to stay in business. This multi-generational resilience ensures that inheritances created today will remain accessible to beneficiaries decades into the future, regardless of corporate lifecycles or market changes.

- **Verifiable Security:** Rather than asking users to trust promises, the architecture makes violations architecturally impossible or immediately detectable. For iOS users, the entire inheritance process operates through public infrastructure—network monitoring confirms communication only with Ethereum and Arweave, with no hidden API calls or secret data channels. Everything operates publicly except private keys, which iOS platform security prevents the app from accessing, even from the beneficiary.

  The audit path is simple: observe network traffic to verify only public blockchain and storage connections with documented data formats. The architecture resists compromise even from malicious insiders or developers, providing security guarantees that can be independently verified rather than simply trusted.

**What does this mean in practice?**

With Inheritor, users tokenize any asset for inheritance without trusting banks or attorneys to hold keys, without paying recurring custody fees, and without depending on any company staying in business for decades. For cryptocurrency wallets specifically, users encrypt their private keys using quantum-safe encryption with beneficiaries designated from the outset. The encrypted materials become tokenized representations stored publicly on blockchain infrastructure where they cannot be lost or destroyed—eliminating the physical vulnerabilities of hardware wallets or paper seed phrases. iOS platform security prevents the app or even the beneficiary from extracting usable key material until smart contract conditions verify the token is claimable.

This maintains the same 'never expose your keys' security standard while removing the risk of loss, theft, or premature access through discovery. The tokenization approach combines cryptographic certainty—the math guarantees assets remain secure—with programmable flexibility through smart contracts that execute exact intentions. Everything operates transparently through public infrastructure that can be independently verified, giving users full control over their tokenized digital estate while ensuring beneficiaries have guaranteed access when the time comes, regardless of institutional changes, market conditions, or corporate lifecycles.

While the architectural time-lock* mechanism has broad applicability across tokenization scenarios—from time-locked release of confidential information and corporate succession planning to whistleblower dead-man switches, escrow arrangements, and conditional access to medical or legal records—Inheritor specifically deploys this breakthrough to solve the inheritance challenge. Where other conditional tokenization applications may emerge over time, the need for secure, trustless On-Chain Digital Inheritance is immediate and universal, affecting anyone who holds assets and wants to ensure their beneficiaries can access them.

_* Patent Pending_

This architectural breakthrough solves the theoretical challenge, but practical deployment requires careful attention to blockchain infrastructure and user experience.

---

## Building a Solution for the Ages

Building a practical tokenization system for conditional inheritance requires careful attention to blockchain infrastructure, permanent storage, condition verification, user experience, and multi-generational resilience. Like all blockchain tokenization, Inheritor creates digital representations on-chain, but the architectural time-lock introduces novel enforcement mechanisms that require thoughtful implementation. Inheritor addresses each component systematically.

### Flexible Blockchain Strategy: Security or Cost Efficiency

Inheritor offers users a choice between Ethereum Layer 1 and Arbitrum for each inheritance they create. Ethereum L1 provides maximum security and decentralization—ideal for high-value assets (cryptocurrency wallets, property deeds) or inheritances where permanence on the most secure layer matters regardless of monetary value (legal documents, irreplaceable records). Arbitrum reduces fees by over 90% through Optimistic Rollups, making it suitable for lower-stakes inheritances (family photos, password lists, social media accounts) while still leveraging Ethereum's security through fraud proofs and 7-day dispute windows. Users can mix and match blockchains across their inheritances, optimizing each transfer based on the specific asset's value, nature, and criticality. (Note: Cardano integration is on our roadmap.)

### Permanent Decentralized Storage with Quantum-Safe Encryption

Standard blockchain tokenization typically stores minimal metadata on-chain (contract state, token IDs) with larger assets referenced via IPFS or centralized storage. However, inheritance requires permanent, immutable storage that persists across generations without recurring costs or maintenance. Inheritor leverages Arweave for decentralized, permanent storage of tokenized assets. Arweave's "pay once, store forever" model eliminates recurring fees while ensuring data permanence through its append-only Blockweave architecture. All tokenized assets are encrypted using X-Wing quantum-safe cryptography, protecting inheritances against future quantum computing threats across generations. This combination creates true multi-generational security: permanent storage with cryptographic protection that remains effective regardless of technological advances.

### Condition Verification: Automated Check-Ins with Optional Human Oversight

The architectural time-lock enforces conditional access through smart contract verification—but how does the system determine when conditions are met without depending on centralized death verification services or institutional attestors? Inheritor implements a check-in mechanism with optional human verification.

Testators confirm their wellbeing through periodic check-ins—a simple interaction taking less than 10 seconds. Missed check-ins trigger a grace period that is independently configurable for each inheritance, enabling precise control over asset release timing. One inheritance might expire 30 days after the final check-in, releasing immediate necessities to beneficiaries, while another might remain locked for a year or longer, deferring access to certain assets until beneficiaries are ready to manage them. When each inheritance's grace period expires, the smart contract automatically updates that inheritance's state to claimable, authorizing beneficiary access. This per-inheritance timing operates entirely through the testator's blockchain interaction, requiring no external verification infrastructure.

For additional protection against accidental expiration, testators can optionally designate a beneficiary as a verifier. A verifier is a beneficiary who receives their own designated inheritance and must also confirm the testator's condition before inheritances become claimable. This dual-role design creates natural incentive alignment: verifiers have direct stake in ensuring accurate verification. Testators assign verifier status through blockchain transactions and can enable or disable verification requirements at any time.

When check-ins are missed and verification is enabled, verifiers can query the smart contract state through the Inheritor application to discover verification requests. Verifiers assess whether the testator is truly incapacitated or merely traveling, ill, or temporarily unavailable, then submit their attestation as an on-chain transaction. This design involves an explicit trade-off: adding human judgment provides protection against premature claiming due to technical issues or temporary unavailability, but introduces a trust assumption that verifiers will act honestly. Testators choose this trade-off for themselves—opting for either purely automated, trustless execution based solely on check-in timing, or adding a human verification layer that introduces trust in exchange for additional safeguards against accidental expiration.

### Seamless User Experience Through Account Abstraction

Inheritor eliminates blockchain complexity through ERC-4337 account abstraction. Gas fees are covered by a paymaster and recovered through in-app purchases—users never need to hold ETH. On-chain actions feel like standard iOS interactions while maintaining verifiable execution. Importantly, the underlying smart contracts remain accessible via traditional externally owned accounts, ensuring infrastructure independence if the app becomes unavailable.

### Resilience Through Dual-Recipient Architecture

While Inheritor's iOS implementation offers zero infrastructure dependencies beyond Ethereum and Arweave, multi-generational accessibility requires insurance against platform evolution. Each tokenized inheritance is encrypted for two quantum-safe recipients: one using iOS platform encryption (X-Wing) with non-exportable keys for full architectural time-lock enforcement, and one using portable ML-KEM-768 encryption with exportable keys. Both paths provide quantum resistance. The portable path uses a lightweight conditional release service (Cloudflare Worker) that verifies smart contract conditions before releasing key material—a minimal infrastructure dependency that ensures token activation even if iOS or the Inheritor app becomes unavailable.

Both paths enforce identical security policies through the same smart contract conditions and cryptographic binding. True decentralization in tokenization emerges from redundant access methods and open asset formats rather than dependence on any single application. This dual-path design ensures tokenized inheritances remain accessible across generations regardless of corporate decisions or platform changes.

Together, these implementation choices—flexible blockchain deployment, permanent quantum-safe storage, automated condition verification, abstracted user interaction, and resilient dual-path access—create a tokenization system that is secure, affordable, and accessible across generations.

---

## The Path to Frictionless Inheritance

Inheritor's ultimate vision is universal asset tokenization for inheritance—a world where any asset, regardless of category, can be represented digitally and transferred conditionally to beneficiaries with equal ease and certainty. Whether native digital (cryptocurrencies, encrypted files), already tokenized (NFTs, real-world assets on-chain), digitized representations (deeds, titles, certificates), or personal instructions—all undergo identical processing: encryption, permanent storage, on-chain representation, and conditional transfer enforcement through the architectural time-lock.

The required technology exists today. Inheritor can already tokenize and conditionally release any asset with blockchain-enforced timing. As legal frameworks evolve to recognize cryptographically authenticated transfers alongside traditional notarization—as jurisdictions increasingly accept digital signatures and blockchain records as legally binding—the tokenization of inheritance will accelerate. McKinsey projects tokenized market capitalization reaching $2 trillion by 2030; inheritance represents a fundamental use case within this broader tokenization wave.

Where traditional inheritance currently requires executors, notaries, physical documents, and coordination across multiple parties, tokenized inheritance enables complex asset transfers with the same reliability and simplicity as blockchain-native tokens. A house deed, properly tokenized, transfers as smoothly as ETH; family heirlooms with detailed instructions move as seamlessly as an NFT. This represents the true democratization of inheritance: transforming historically complex, paper-dependent processes into automated, verifiable tokenized transfers that execute with digital precision—available to anyone, anywhere.

---

## Conclusion

Blockchain tokenization has transformed how we represent and transfer value, but conditional transfers—where tokens activate only when verifiable conditions are met—have remained elusive without trusted intermediaries. For the first time, Inheritor's architectural time-lock* mechanism resolves this fundamental paradox, enabling truly trustless conditional tokenization.

The breakthrough lies in separating token possession from token activation. Beneficiaries receive complete tokenized inheritance materials from day one—all cryptographic keys, all encrypted assets, all metadata stored publicly on blockchain infrastructure. Yet the architecture ensures these materials remain inert until verifiable on-chain conditions are satisfied. This is tokenization without custody dependencies, without escrow services, without trust requirements.

The implications extend across asset classes. Cryptocurrency holders can tokenize their wallets for inheritance with greater safety than hardware wallets while guaranteeing beneficiary access. Families can tokenize login credentials, encrypted files, and personal instructions without trusting third parties. Legal documents and property deeds can be tokenized and released automatically when conditions are met, integrating with—rather than replacing—traditional legal frameworks.

As blockchain tokenization grows toward McKinsey's projected $2 trillion market by 2030, conditional transfers will become increasingly critical. Inheritor's architectural time-lock provides the missing infrastructure for this evolution—enabling tokenized assets to transfer according to programmable conditions without reintroducing centralization. Inheritances created today will execute decades into the future through public blockchain infrastructure that anyone can verify and no one can shut down.

Beyond the technical innovation, Inheritor democratizes inheritance planning. Creating a Digital Will—tokenizing your complete estate for designated loved ones—becomes as simple as using your phone from home, requiring no attorneys, notaries, or complex procedures. Every cryptocurrency wallet, every cherished photo collection, every important credential can be tokenized and secured for those you leave behind—not as a distant obligation requiring professional assistance, but as an ongoing expression of responsibility and love, maintained with the same ease as managing any other aspect of your digital life.

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

This white paper is for informational purposes only and does not constitute legal, financial, or investment advice. Users are responsible for ensuring their inheritance instructions comply with applicable laws including forced heirship requirements, tax obligations, and jurisdictional regulations. For registry-bound assets, professional legal counsel should draft transfer documents to ensure compliance with local inheritance law. Inheritor provides infrastructure for secure, autonomous execution of legally compliant instructions. Consult with professional advisors before making any inheritance decisions.
