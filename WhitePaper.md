# On-Chain Digital Inheritance

**Author:** aernoud@inheritor.app
**Website:** www.inheritor.app

## Abstract

As the world becomes increasingly digitized, the value and prevalence of digital assets have grown significantly. Private keys to crypto wallets, online banking passwords, access to social media accounts, personal video messages, and even instructions for physical possessions are examples of property that may be lost upon an individual's unexpected death or incapacitation.

We propose a peer-to-peer solution — **Inheritor** — that implements *on-chain digital inheritance*: a smart-contract-based execution layer that automates event-driven, time-locked transfer of rights. For most digital assets, where **access itself equals ownership**, Inheritor directly enforces the testator's intent without third-party custodians. Where the law requires formal deeds (e.g., real estate or registered shares), lawyers and notaries remain involved, with Inheritor providing the secure release mechanism for their pre-signed instruments.

## Introduction

In today's digital era, individuals accumulate a wide range of assets — from cryptocurrency wallets and online accounts to physical property tied to personal instructions. Traditional inheritance processes involve creating a will with legal professionals, often including notaries, who act as custodians of confidential documents and transfer deeds. Yet this model struggles to address the **growing class of purely digital assets**, where the decisive fact is simply *who has access*.

This mismatch leaves many people unprotected: they postpone creating wills, face difficulty accessing trustworthy notaries, or risk complete loss of digital property through secrecy of keys and passwords. Inheritor directly addresses this gap.

Our approach recognizes three broad categories of assets:

1. **Purely digital assets** where access = ownership.
2. **Registry-bound assets** where the law mandates a formal deed (e.g., real estate).
3. **Personal or hybrid assets** where the testator's clear instructions should be respected (e.g., a car, computer, or family keepsake).

Inheritor is built for categories **1 and 3** as its natural domain, while still supporting category **2** by releasing lawyer/notary-authenticated deeds when required. In all cases, execution shifts from paper-based, human-administered steps to **cryptographically enforced, on-chain automation**. See Market Context below.

## Market Context

The opportunity for on-chain digital inheritance must be seen in the context of the largest wealth transfer in history: $84 trillion globally through 2045, with Europe alone accounting for $3.5 trillion by 2030. The European estate planning market is valued at €3.85 billion today and projected to nearly double by 2031, with the digital segment growing at over 13% annually. Yet despite this growth, more than two-thirds of adults have no formal will, and €300+ billion in inefficiencies persist each year from cross-border disputes, probate delays, and digital asset losses (sources in internal market analysis).

Inheritor directly addresses these inefficiencies. Where traditional notarial and probate systems impose high costs, long delays, and jurisdictional fragmentation, Inheritor offers a cryptographically enforced, cross-border solution that integrates with existing legal frameworks. By aligning with regulatory clarity in Europe (GDPR, MiCA) and leveraging blockchain's immutability, Inheritor is positioned at the intersection of demographic inevitability and digital transformation.

## Defining On-Chain Digital Inheritance

*On-Chain Digital Inheritance* represents a transformative application of blockchain technology that moves beyond conventional estate planning. Rather than merely mimicking traditional wills in a digital form, this approach reconceptualizes inheritance as a cryptographically enforced, autonomous transfer of ownership.

Through smart contracts, beneficiaries can be granted provable, time-locked access to digital or tokenized tangible assets, with the **execution automated on-chain**. Legal professionals remain involved only where the law requires formal instruments, ensuring that Inheritor integrates with — rather than replaces — existing legal frameworks.

This system is not limited to the inheritance of cryptocurrencies or digital files. By leveraging tokenization, it can securely manage and transfer rights to real-world assets — such as real estate titles, intellectual property, or share certificates — while its natural strength lies in handling assets where access itself constitutes ownership. Its tamper-proof, transparent, and decentralized nature ensures verifiability, security, and alignment with global legal frameworks like eIDAS (EU) and ESIGN (US).

## The Challenge of Digital Inheritance

Unexpected death or incapacitation can lead to the permanent loss of digital assets, as security protocols discourage sharing passwords and private cryptographic keys. Without knowledge of or access to these credentials, beneficiaries cannot retrieve important digital assets. Ensuring that digital assets remain inaccessible to beneficiaries until the inheritor's passing presents a unique challenge. Modern cryptographic systems typically require beneficiaries to possess private keys, granting them the ability to decrypt assets at any time, which conflicts with the requirement for conditional access based on the inheritor's status.

## A Peer-to-Peer Solution

A peer-to-peer inheritance model is more intuitive, enabling individuals to directly appoint beneficiaries and allocate assets via a digital platform, thus eliminating reliance on third-party custodians. This approach addresses concerns about entrusting sensitive information—such as crypto private keys—to external entities. Existing solutions like multi-signature wallets and private server storage still require trust in third parties and their assurances of ethical practices and perpetual infrastructure.

Blockchain technology offers a trustless, distributed, peer-to-peer framework for transactions and data storage. This facilitates the development of solutions that empower individuals to act as their own custodians of digital assets designated for beneficiaries, effectively disrupting the traditional notary model.

## Smart Contracts as the Execution Layer

Smart contracts are conceptually ideal for guaranteeing inheritance execution—transferring rights to designated beneficiaries under predefined conditions (e.g., within one month after the inheritor's death)—with cryptographic assurances against tampering. Deployed on a distributed blockchain, they provide strong guarantees that the inheritance is executed according to the testator's intentions, without manual administration by an executor or notary in the execution layer.

A dead-man switch mechanism can be utilized to activate the transfer of access to the digital asset from owner to beneficiary. By storing the asset on the blockchain and controlling access via a smart contract, we enable a secure and conditional transfer.

## Why Ethereum?

Initially, we planned to implement the digital inheritance concept on Cardano, recognized for its advanced conceptual and technical blockchain capabilities. However, the complexity and steep learning curve of Cardano development postponed this approach. Integrating Inheritor with the Cardano blockchain remains on our roadmap.

After evaluating various options, we decided to build Inheritor on Ethereum, the original smart contract blockchain. Working directly on Ethereum's Layer 1 provides optimal security, decentralization, and censorship resistance, which are crucial for applications with low transaction volumes that require high trust. Layer 2 solutions and alternative blockchains, such as Solana and Arbitrum, offer higher throughput and lower costs. However, they also introduce additional operational complexities, potential security vulnerabilities, and reduced censorship resistance due to their reliance on off-chain computations and less mature infrastructure.

Moreover, these Layer 2 solutions often exhibit a less decentralized network of validators, conflicting with Ethereum's core principles of trustlessness and censorship resistance. By leveraging Ethereum's Layer 1, we ensure maximum security, decentralization, and longevity for the smart contracts governing digital inheritance.

While deploying smart contracts on Ethereum's Layer 1 can be relatively costly due to higher gas fees, we consider this expense to be a worthwhile investment in security and trustlessness. The additional costs are easily offset when compared to the operational expenses and risks associated with centralized solutions like notaries or solutions acting as or depending on third-party custodians.

Traditional methods often involve ongoing fees, the potential for human error, and vulnerabilities to fraud or malpractice. By utilizing Ethereum's robust and decentralized network, Inheritor eliminates intermediaries and leverages blockchain technology to provide a secure, one-time setup cost that ensures the integrity and longevity of inheritance plans. This guaranteed execution of an inheritance plan is priceless, offering peace of mind that your final wishes will be honored without the uncertainties and delays associated with traditional processes.

## Arbitrum One: A Cost-Efficient Complement to Ethereum's Unmatched Security

While Ethereum Layer 1 remains the gold standard for high-value inheritance plans—offering unmatched decentralization, censorship resistance, and rapid economic finality—Arbitrum One provides a pragmatic, low-cost alternative for users prioritizing affordability. By leveraging Ethereum's security through Optimistic Rollups, Arbitrum slashes transaction fees by over 90%, making it ideal for smaller estates or frequent updates to inheritance plans.

However, Arbitrum's security model introduces trade-offs. Its validation process relies on a smaller set of validators to detect and contest fraudulent transactions during a 7-day dispute window. While Ethereum ultimately enforces finality, beneficiaries must temporarily trust that validators act diligently during this period—a contrast to Ethereum Layer 1, where transactions finalize irreversibly without intermediaries.

Censorship risks also differ. Arbitrum's sequencer, a centralized component responsible for ordering transactions, could theoretically delay or exclude transactions. Though mitigations like forced inclusion via Ethereum exist, Arbitrum's validator network remains less decentralized than Ethereum's global node distribution, marginally increasing exposure to collusion or regulatory pressure.

For high-value inheritance plans, these compromises warrant caution. While Arbitrum's fraud proofs and Ethereum-backed finality provide robust security, Ethereum Layer 1 stands alone for assets demanding absolute assurance against censorship or centralization.

In summary, while Arbitrum One presents an attractive solution for its lower costs and increased throughput, its reduced censorship resistance and greater centralization necessitate careful consideration—especially for high-value inheritance plans. Inheritor's integrated approach ensures users can tailor their digital inheritance strategy, optimizing for either cost efficiency or uncompromising security.

## Digital Asset Storage with Arweave

Storing large digital assets directly on the Ethereum blockchain is impractical due to inherent limitations. Ethereum imposes high gas costs for data storage, rendering large file uploads economically unfeasible. The network enforces strict block size and transaction data limits to maintain performance and decentralization.

Arweave offers significant advantages for secure, long-term inheritance solutions. It is a decentralized, append-only storage network utilizing a blockchain-like structure called the Blockweave. Its distributed nature ensures data redundancy and resistance to censorship or data loss.

The append-only architecture guarantees immutability; once data is stored, it cannot be altered or deleted. This is crucial for inheritance, as it ensures the digital asset remains intact and untampered until the beneficiary accesses it.

Moreover, Arweave's fee structure significantly enhances the practicality of Inheritor for digital inheritance. Arweave operates on a one-time payment model that ensures permanent data storage, eliminating the need for recurring fees. This "pay once, store forever" approach perfectly aligns with the requirements of digital inheritance, where assets must remain accessible and intact indefinitely. By leveraging Arweave, Inheritor provides a cost-effective solution that guarantees the enduring preservation of digital assets without the burden of ongoing operational expenses. This ensures that beneficiaries can reliably access their inherited assets long into the future, without concerns about storage sustainability or escalating costs.

Inheritor in tandem with Arweave employs Merkle trees to handle large file uploads efficiently and to verify data integrity. By breaking files into chunks and hashing them into a Merkle tree structure, it enables quick detection of any tampering attempts. This cryptographic method ensures that even with large datasets, the integrity verification process remains efficient.

By encrypting digital assets before storage, confidentiality is maintained—only the intended beneficiary with the correct decryption key can access the content. Combined with Arweave's permanent and tamper-proof storage, this approach provides a secure and reliable method for preserving digital assets intended for future inheritance.

## Overcoming Blockchain Challenges

Blockchains are public and transparent; all data and transactions are visible. For inheritance purposes, we require a method to store digital assets such that no one—not even the beneficiary with the private key—can access them prematurely. Implementing a time-release mechanism allows for the conditional release of the decryption key. While the decryption key can be stored on the public blockchain (since only the beneficiary can use it), it should remain hidden from the beneficiary until the appropriate time, especially for sensitive messages intended to be disclosed posthumously.

Additionally, interacting with blockchains can be complex for users, particularly due to the need to manage digital wallets, private keys, and gas fees associated with transactions. These complexities can be a significant barrier to entry for individuals who are not familiar with blockchain technology. Inheritor simplifies this process by leveraging ERC-4337 compliant contracts, which enable account abstraction on Ethereum. This allows users to interact with the blockchain without the need to set up traditional externally owned accounts (EOAs) or manage private keys directly.

ERC-4337, also known as Ethereum Improvement Proposal 4337, introduces a new standard for account abstraction at the protocol level without requiring consensus-layer changes. By using smart contract wallets that comply with ERC-4337, Inheritor can provide users with a seamless experience where the complexities of gas fees and key management are abstracted away.

With account abstraction, users can perform blockchain transactions using familiar authentication methods, such as biometric data (Face ID), instead of dealing with private keys. Gas fees, which are typically paid in Ether, can be handled within the smart contract and are subsidized by Inheritor, removing the need for users to hold Ether just to pay for transaction fees.

By integrating ERC-4337 compliant smart contract wallets, Inheritor enables:

- Gas Abstraction: The smart contract can handle gas fees internally or utilize gas relayers, allowing users to perform transactions without needing to understand or pay gas fees directly.
- Seamless Interaction: Users can interact with the blockchain through the Inheritor app without installing browser extensions or specialized wallet software.

By adopting ERC-4337 account abstraction, Inheritor positions itself as one of the first iOS apps to seamlessly leverage blockchain technology without the typical complexities associated with it. By abstracting away the need for users to manage private keys or handle gas fees, Inheritor integrates blockchain functionalities into the iOS platform in a user-friendly manner. This allows users to interact with the app just like any other iOS application, without needing to understand the underlying blockchain mechanics.

As a result, Inheritor not only simplifies the process of setting up an inheritance plan but also demonstrates how blockchain technology can be made accessible to the general public through an intuitive mobile application.

## Cryptography Without the Crypto

For the encryption and decryption of digital assets, Inheritor employs a sophisticated dual-key cryptographic architecture that separates blockchain interaction from asset encryption. Recognizing that quantum computers will eventually break traditional public-key cryptography, we've implemented a system where ALL digital assets are protected with quantum-safe encryption, while maintaining classical cryptography for blockchain compatibility.

The dual-key architecture serves distinct purposes: secp256k1 keys handle all Ethereum blockchain operations—signing transactions, executing smart contracts, and verifying ownership—while X-Wing quantum-safe keys exclusively protect the digital assets themselves. This separation ensures that even when quantum computers can break ECDSA (threatening blockchain signatures), the actual inherited assets remain secure through post-quantum cryptography.

For asset encryption, Inheritor uses X-Wing—a hybrid scheme combining ML-KEM-768 (NIST's post-quantum standard based on lattice cryptography) with X25519 elliptic curves. Every digital asset is encrypted using this quantum-safe method before storage on Arweave. The X-Wing hybrid creates a shared secret, which HKDF then derives into a symmetric key that encrypts the actual asset using AES-256-GCM for authenticated encryption. This ensures both confidentiality and integrity, with the quantum-safe layer providing decades of future-proof security. This hybrid approach follows NIST recommendations for post-quantum cryptography.

Beneficiary codes elegantly combine both key types: 132 characters for the secp256k1 public key (enabling blockchain interaction) followed by 1,624 characters for the X-Wing public key (enabling asset decryption), plus the base64-encoded beneficiary name. This comprehensive code allows beneficiaries to both claim their inheritance on the Ethereum blockchain and decrypt the quantum-safe protected assets—two separate but essential operations.

By implementing X-Wing quantum-safe encryption for all assets while maintaining secp256k1 for blockchain operations, Inheritor achieves optimal security without sacrificing compatibility. This "implement now for later" philosophy ensures that digital inheritance created today will remain cryptographically secure even in a post-quantum world, while still leveraging Ethereum's existing infrastructure for trustless execution of inheritance conditions.

## Off-Chain Storage of the Decryption Key

Storing the encrypted symmetric key package on the Ethereum blockchain could allow the beneficiary to access the digital asset prematurely, before the conditions are fulfilled. Even designating variables as 'private' within a smart contract does not prevent external access, as all on-chain data is visible to network participants leveraging more sophisticated methods.

To address this, we store the package off-chain. This brings us to a different kind of blockchain trilemma involving decentralization, privacy, and security. While blockchain technology offers decentralization and security through its transparent and immutable ledger, this transparency can conflict with the need for privacy—particularly when handling sensitive information like decryption keys in a digital inheritance scenario.

## Balancing Decentralization, Privacy, and Security

Public blockchains like Ethereum are inherently transparent; all data and transactions are publicly accessible. This transparency ensures trustlessness and verifiability but poses a challenge for applications requiring confidentiality. Storing sensitive data directly on-chain could expose it to unauthorized parties, undermining privacy and security.

This creates a trilemma where enhancing privacy may compromise decentralization or security:

- Enhancing Privacy: Utilizing off-chain storage or encryption can protect sensitive data but may introduce centralized components or reduce transparency.
- Maintaining Decentralization: Keeping all data on-chain supports decentralization but risks exposing sensitive information due to the blockchain's transparent nature.
- Ensuring Security: Robust security measures must protect against unauthorized access without introducing central points of failure or sacrificing decentralization.

## Inheritor's Approach to the Trilemma

Inheritor addresses this trilemma by strategically balancing these aspects:

- Off-Chain Storage for Privacy: Sensitive data, such as the encrypted symmetric key, is stored off-chain using Cloudflare's distributed network. While Cloudflare is a privately owned entity (introducing a degree of centralization), it offers robust security and global data availability. This enhances privacy by keeping decryption keys off the public blockchain.
- On-Chain Verification for Decentralization and Security: Critical verification processes, such as enforcing inheritance conditions, are managed on-chain using Ethereum's immutable smart contracts. This maintains decentralization and leverages blockchain security for condition enforcement.
- Robust Cryptographic Techniques for Security: Advanced encryption methods ensure that even if off-chain data storage is centralized, the data remains secure and inaccessible without the proper cryptographic keys.

By accepting a slight compromise in decentralization for significant gains in privacy and security, Inheritor effectively balances this trilemma. The use of off-chain storage does not undermine the overall trustlessness of the system because the essential verification and state management occur on the decentralized blockchain.

## An Innovative Time-Lock Mechanism

Traditional time-lock encryption methods, such as time-lock puzzles and Verifiable Delay Functions (VDFs), have limitations when applied to secure digital inheritance systems. Time-lock puzzles are inefficient due to high computational burdens and susceptibility to advancements in computing power. VDFs, while more secure against parallelization, still impose significant computational demands and do not adapt to external conditions like the owner's status.

The Inheritor smart contract overcomes these limitations by leveraging blockchain technology to create a conditionally accessible inheritance mechanism based on the owner's activity. The contract defines an InheritanceState with states such as Active, Claimable, Claimed, and Cancelled. The owner must periodically call the checkin() function to reset the lastCheckIn timestamp, keeping the inheritance in the Active state. If the owner fails to check in within the specified checkinInterval plus a gracePeriod, the contract's state transitions to Claimable, allowing the beneficiary to call claimInheritance().

This mechanism ensures that the inheritance becomes accessible to the beneficiary under the correct conditions—specifically, when the owner has not checked in within the allotted time frame, indicating possible incapacitation or death. Ethereum's immutable and transparent blockchain enforces these conditions reliably and without the possibility of tampering.

## The Role of Cloudflare Workers

The Cloudflare Worker acts as an intermediary that securely manages the conditional release of the encrypted symmetric key based on the state of the Ethereum smart contract. When an inheritance contract is created, the Inheritor app sends a POST request to the Worker with the contractAddress and encryptedSymmetricKey. The Worker validates the input using EIP-712 structured data signatures and stores the encrypted key in Cloudflare's Key-Value (KV) storage, using the contract address as the key.

When a beneficiary attempts to retrieve the key, Inheritor sends a GET request to the Worker. Before releasing the key, the Worker verifies whether the conditions for its release have been satisfied by checking the contract's state on the Ethereum blockchain. It uses ethers.js and connects through Infura to interact with the blockchain. The beneficiary's request is also authenticated using EIP-712 signatures to ensure only authorized parties can retrieve the encrypted symmetric key.

If the contract state confirms that the key should be released, the Worker provides the encrypted symmetric key. If not, it informs the requester accordingly.

Robust error handling and retry mechanisms ensure that transient network issues do not prevent the key from being released when appropriate. Security considerations are central to this design; the encrypted symmetric key is safe in KV storage because, without the appropriate private key, it cannot be decrypted.

## Integrating the Components

Integrating the smart contract with components like Arweave and an off-chain Cloudflare Worker enhances the system's security and efficiency. The encrypted digital asset is stored on Arweave, ensuring data permanence and integrity. The Cloudflare Worker acts as an off-chain oracle, determining if the encrypted symmetric key should be released based on the smart contract's state.

By utilizing Cloudflare's distributed edge computing infrastructure, the system benefits from robust security and high availability, despite a slight trade-off in decentralization. This integrated solution represents a state-of-the-art method for secure, distributed time-lock implementation in inheritance plans and digital inheritance. It overcomes traditional limitations by eliminating reliance on computational delays and instead using time-based conditions and user activity to control access. The smart contract provides an immutable record of conditions, while off-chain services enforce access control efficiently.

By combining blockchain smart contracts with distributed storage and edge computing, this approach ensures that digital assets are accessible only to rightful beneficiaries under predefined conditions, maintaining privacy and security throughout the process. It sets a new standard for secure, conditional access to digital inheritance.

## Ensuring Accessibility Beyond the Inheritor App

Inheritor is fundamentally designed to ensure that beneficiaries can retrieve their inherited digital assets even without the use of the Inheritor app or reliance on platforms like Apple's ecosystem. Recognizing that the longevity and accessibility of digital inheritance should not depend on any single application or company, Inheritor utilizes open-source technologies and public domain protocols. All the cryptographic methods, smart contract codes, and blockchain data used are based on widely adopted, publicly available standards. This transparency ensures that the process is not tied to proprietary software or closed systems that could become obsolete or inaccessible.

To facilitate independent access, Inheritor will provide open-source scripts and comprehensive documentation in the public domain. These resources will guide beneficiaries on how to retrieve and decrypt their inherited assets without relying on the Inheritor app. The provided tools will include scripts for interacting directly with the Ethereum blockchain to verify the state of the inheritance smart contract and to invoke necessary functions like claimInheritance(). Additionally, decryption utilities will be available to perform the cryptographic operations required to recover the encrypted symmetric key and decrypt the digital asset stored on Arweave.

By making these resources publicly available, Inheritor ensures that beneficiaries can access their inheritance regardless of future uncertainties surrounding specific technologies or organizations. This approach aligns with the decentralized principles of blockchain technology, emphasizing user empowerment and resilience.

It guarantees that the inheritance mechanism remains operational indefinitely, free from dependencies on any single application or entity. Beneficiaries can be confident that they will be able to retrieve their inherited digital assets securely and efficiently, using publicly available tools and protocols, even if Inheritor or other platforms cease to exist.

## Forward-Looking Legal Position & Compliance Path

Inheritor is designed to complement — not replace — the legal systems that govern inheritance. Our stance is simple:

- **Category 1: Digital assets (access = ownership)**
  These transfer directly by releasing keys, credentials, or access rights to the beneficiary.

- **Category 2: Registry-bound assets (formal deed required)**
  Where the law mandates notarial deeds or court filings, Inheritor releases encrypted, pre-signed instruments for beneficiaries to present to the relevant authority.

- **Category 3: Hybrid/personal assets**
  Assets such as vehicles, electronics, or keepsakes may not legally require deeds but still rely on the **testator's clear instructions**. Inheritor enforces these instructions, creating an immutable record of intent and transfer.

In all categories, Inheritor provides cryptographic evidence of authorship, designation, and timing — creating a verifiable audit trail consistent with digital-signature and e-records frameworks (eIDAS, ESIGN/UETA). Optional hooks for court or notarial overrides ensure compatibility with contested cases.

## Conclusion

Inheritor introduces a new paradigm: **On-Chain Digital Inheritance** as a programmable and autonomous system of transfer. Its natural strength lies in assets where *access equals ownership*, while also enabling personal instructions to be carried out with cryptographic certainty. For registry-bound assets requiring formal deeds, Inheritor functions as the secure release layer that complements legal processes. Most real-world use will involve Category 1 and 3 assets; Category 2 is supported where law mandates a deed.

This dual-track model — direct key handover for digital assets and document release where formal deeds are required — provides a pragmatic, forward-compatible path as courts and regulators continue to recognize blockchain-secured records and signatures.

By addressing the challenges of inheritance through a seamless integration of on-chain and off-chain technologies, Inheritor represents a significant advancement in how individuals can confidently and securely pass on their most valuable rights — across generations, across jurisdictions, and across time.

## References

1. **Merkle Trees**
   - Wikipedia: Merkle Tree. Available at: https://en.wikipedia.org/wiki/Merkle_tree

2. **Ethereum**
   - Buterin, V. (2013). "Ethereum Whitepaper: A Next-Generation Smart Contract and Decentralized Application Platform". Available at: https://ethereum.org/en/whitepaper/
   - Official Ethereum Website. Available at: https://ethereum.org/

3. **Arweave**
   - Arweave Documentation. Available at: https://docs.arweave.org/
   - Williams, S. "Arweave: A Protocol for Economically Sustainable Information Permanence" Available at: https://www.arweave.org/yellow-paper.pdf

4. **Advanced Encryption Standard – Galois/Counter Mode (AES-GCM)**
   - NIST Special Publication 800-38D: "Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode (GCM) and GMAC". Available at: https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf
   - Wikipedia: Galois/Counter Mode (GCM). Available at: https://en.wikipedia.org/wiki/Galois/Counter_Mode

5. **Post-Quantum Cryptography and ML-KEM**
   - NIST Post-Quantum Cryptography Standardization. Available at: https://csrc.nist.gov/projects/post-quantum-cryptography
   - NIST FIPS 203: "Module-Lattice-Based Key-Encapsulation Mechanism Standard". Available at: https://doi.org/10.6028/NIST.FIPS.203
   - Schwabe, P., et al. (2019). "CRYSTALS-KYBER: A CCA-secure module-lattice-based KEM". Available at: https://eprint.iacr.org/2017/634.pdf

6. **X-Wing Hybrid KEM**
   - Connolly, D., Schwabe, P., & Stebila, D. (2024). "X-Wing: The Hybrid KEM You've Been Looking For". Available at: https://eprint.iacr.org/2024/039.pdf
   - IETF Draft: "X-Wing: general-purpose hybrid post-quantum KEM". Available at: https://datatracker.ietf.org/doc/draft-connolly-cfrg-xwing-kem/

7. **X25519 Elliptic Curve**
   - RFC 7748: "Elliptic Curves for Security". Available at: https://tools.ietf.org/rfc/rfc7748.txt
   - Bernstein, D. J. (2006). "Curve25519: new Diffie-Hellman speed records". Available at: https://cr.yp.to/ecdh/curve25519-20060209.pdf

8. **HKDF (HMAC-based Key Derivation Function)**
   - RFC 5869: "HMAC-based Extract-and-Expand Key Derivation Function (HKDF)". Available at: https://tools.ietf.org/rfc/rfc5869.txt
   - Krawczyk, H., & Eronen, P. (2010). "HMAC-based Extract-and-Expand Key Derivation Function (HKDF)". Available at: https://eprint.iacr.org/2010/264.pdf

9. **Verifiable Delay Functions (VDFs)**
   - Boneh, D., Bonneau, J., Bünz, B., & Fisch, B. (2018). "Verifiable Delay Functions". Available at: https://eprint.iacr.org/2018/601.pdf

10. **Cloudflare Workers**
    - Cloudflare Workers Documentation. Available at: https://developers.cloudflare.com/workers/
    - Cloudflare Blog: "Introducing Cloudflare Workers". Available at: https://blog.cloudflare.com/introducing-cloudflare-workers/

11. **ECDSA and secp256k1 Curve**
    - Standards for Efficient Cryptography Group (SECG): "SEC 2: Recommended Elliptic Curve Domain Parameters". Available at: https://www.secg.org/sec2-v2.pdf

12. **Time-Lock Encryption**
    - Rivest, R. L., Shamir, A., & Wagner, D. A. (1996). "Time-lock Puzzles and Timed-release Crypto". Available at: https://people.csail.mit.edu/rivest/pubs/RSW96.pdf
    - Wikipedia: Time-lock Puzzle. Available at: https://en.wikipedia.org/wiki/Time-lock_puzzle

13. **Edge Computing**
    - Shi, W., Cao, J., Zhang, Q., Li, Y., & Xu, L. (2016). "Edge Computing: Vision and Challenges". IEEE Internet of Things Journal, 3(5), 637-646. Available at: https://ieeexplore.ieee.org/document/7488250
    - Wikipedia: Edge Computing. Available at: https://en.wikipedia.org/wiki/Edge_computing

14. **Elliptic Curve Digital Signature Algorithm (ECDSA)**
    - NIST FIPS 186-5: "Digital Signature Standard (DSS)". Available at: https://doi.org/10.6028/NIST.FIPS.186-5

15. **Symmetric Key Encryption**
    - Schneier, B. (1996). Applied Cryptography: Protocols, Algorithms, and Source Code in C. John Wiley & Sons.
    - Wikipedia: Symmetric-key Algorithm. Available at: https://en.wikipedia.org/wiki/Symmetric-key_algorithm
    - Infura Documentation. Available at: https://infura.io/docs

16. **Ethers.js**
    - Ethers.js Documentation. Available at: https://docs.ethers.io/v5/
    - GitHub Repository: ethers-io/ethers.js. Available at: https://github.com/ethers-io/ethers.js/

## Acknowledgments

We would like to thank the open-source and AI community and the developers of the technologies utilized in this project. Their contributions have been invaluable in enabling the development of Inheritor.

## Future Work

Looking ahead, we plan to:

- **Expand Blockchain Compatibility:** Integrate Inheritor with Cardano to offer users more options based on their preferences and needs.
- **Enhance User Experience:** Continue simplifying the user interface to make the process of setting up digital inheritance plans even more accessible to non-technical users.
- **Security Audits:** Undergo comprehensive security audits by third-party experts to validate and enhance the security measures implemented.
- **Legal Compliance:** Collaborate with legal experts to ensure that digital inheritance created with Inheritor is recognized and enforceable under various jurisdictions.

## Glossary

- **Smart Contract:** A self-executing contract with the terms of the agreement directly written into code, running on a blockchain.
- **Blockchain Trilemma:** The challenge in achieving decentralization, security, and scalability (or privacy) simultaneously in blockchain systems.
- **Dead-Man Switch:** A mechanism that triggers an action if a required input is not received within a set time, used here to transition the contract state based on the owner's activity.
- **AES-256-GCM:** Advanced Encryption Standard in Galois/Counter Mode — a symmetric encryption algorithm that provides both **confidentiality** (encryption) and **integrity** (authentication) by combining AES encryption with Galois Message Authentication Code (GMAC).
- **Post-Quantum Cryptography:** Cryptographic algorithms designed to be secure against attacks by both classical and quantum computers, protecting against future quantum computing threats.
- **ML-KEM (Module Lattice-based Key Encapsulation Mechanism):** NIST's standardized post-quantum key encapsulation mechanism based on lattice cryptography, providing quantum-resistant key agreement.
- **X-Wing:** A hybrid key encapsulation mechanism that combines ML-KEM-768 (post-quantum) with X25519 (classical elliptic curve) to provide security against both classical and quantum computer attacks.
- **X25519:** A high-speed elliptic curve key agreement algorithm based on Curve25519, providing classical cryptographic security and performance.
- **Key Encapsulation Mechanism (KEM):** A cryptographic technique where a sender generates a random symmetric key and encrypts it using the recipient's public key, enabling secure key agreement.
- **Dual-Key Architecture:** Inheritor's design using separate key pairs for blockchain operations (secp256k1) and asset encryption (X-Wing quantum-safe keys), providing role isolation and quantum resistance.
- **Arweave Blockweave:** A blockchain-like data structure used by Arweave to store data permanently and efficiently.
- **KV Storage:** Key-Value Storage, a simple database that stores data as a collection of key-value pairs.
- **HKDF:** HMAC-based Key Derivation Function; a method for deriving cryptographically strong keys from a shared secret. It employs a random salt and a domain-specific info string to ensure the derived key is uniformly random and context-bound.
- **Salt (Cryptographic):** A randomly generated value used in key derivation to ensure that even identical inputs produce unique derived keys, preventing vulnerabilities from key reuse.
- **Nonce:** A number used only once in encryption processes, such as in AES-GCM, to guarantee that each encryption operation produces a unique ciphertext even when the same plaintext is encrypted multiple times.
- **Domain Separation (Info String):** A context-specific value used in key derivation (e.g., within HKDF) to bind the derived key to a particular application or purpose, ensuring that keys derived in different contexts remain distinct.
- **Beneficiary Code:** A composite identifier containing both classical (secp256k1) and quantum-safe (X-Wing) public keys along with the beneficiary's name, enabling complete inheritance setup.
- **Executor (Common Law):** The personal representative appointed by a will (or by the court if none is named) to administer the estate, including collecting assets, paying debts/taxes, and distributing the remainder to beneficiaries.
- **Probate (Common Law):** The court-supervised process that authenticates the will (if any), appoints a personal representative, and oversees estate administration and distribution according to law.

## Contact Information

For more information about Inheritor or to contribute to the project, please contact:

- Email: aernoud@inheritor.app
- Website: www.inheritor.app

## Disclaimer

This white paper is for informational purposes only and does not constitute legal, financial, or investment advice. Users should consult with professional advisors before making any decisions based on the information provided.

**Note:** The technologies and protocols referenced in this document are subject to ongoing development and improvement. Readers are encouraged to refer to the latest documentation and research for the most up-to-date information.