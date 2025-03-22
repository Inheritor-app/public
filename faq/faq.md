# INHERITOR FAQ

## Digital Wills & Inheritance

### What is a Digital Will?
A Digital Will is the sum total of all Inheritances you have assigned to Beneficiaries. As such, it often functions as a "Last Will and Testament" that determines the fate of your Digital Assets after death. In Inheritor, your Digital Will lives on the blockchain as a smart contract on either the Arbitrum network, the Ethereum network, or both.

### What is an Inheritance?
An Inheritance consists of a Digital Asset you want to designate to a Beneficiary to be received after your death. In Inheritor, there are attributes you can assign to an Inheritance, such as how long after your death the Beneficiary can claim your inheritance, on which blockchain the Inheritance is added to your Digital Will, whether the Inheritance is 'Anonymous', etc.

### What is a Digital Asset?
In Inheritor, any digital file can be a Digital Asset. The Digital Asset can be a letter to the beneficiary, a video or audio message, business or legal documents, etc. It can also be a file containing access codes to bank accounts, social media accounts, crypto wallets (private keys, NFTs), etc. In short, anything that you consider important or valuable, is in digital format, and want to pass on to your loved ones. In the Digital Age, access often means 'ownership', making the passing on of Digital Assets a very effective addition to Legacy Planning.

### What is a Beneficiary?
A Beneficiary is any person named in your Digital Will. You can add potential Beneficiaries by scanning their Beneficiary code. Whenever you are ready to designate an Inheritance to a person, you can select any of the potential Beneficiaries.

### What is a Beneficiary code?
In Inheritor, the Beneficiary code consists of the (uncompressed) public key + the name (moniker) of the beneficiary in hex-encoded format. As this code is very long, you can add new Beneficiaries easily by just scanning a QR code. The Beneficiary code is used by Inheritor to create a unique link between Testator and Beneficiary as together they form a public/private key pair.

## Cryptography & Keys

### What is a Public Key?
A Public Key is used in Public-key cryptography (or asymmetric cryptography) which forms the base of all blockchain transactions. This key is 'public' so you can share it with anyone who might be a (potential) Beneficiary. Simply speaking, a public key is a key that can only close locks.

### What is a Private Key?
A Private Key is used in Public-key cryptography (or asymmetric cryptography) which forms the base of all blockchain transactions. This key is 'private' so you should NEVER share it with anyone. Simply speaking, a private key is a key that can unlock locks which have been closed by a Public key.

### What Encryption does Inheritor use? Can I safely pass on all my secrets (private keys, passwords, business documents) to my loved ones using Inheritor?
Yes, as long as you keep your Private key private. Please refer to the White Paper for technical details.

## Networks & Technical Terms

### What is a Network?
In Inheritor, "network" refers to either the Ethereum (mainnet) blockchain or the Arbitrum (One) blockchain.

### What is an Anonymous Inheritance?
You can designate an Inheritance to a Beneficiary anonymously. This means that the Beneficiary will not know or see from whom they have been designated an Inheritance.

### What is a Grace Period?
The Grace Period determines the time between the last Check-in of the Testator and the moment the Inheritance becomes 'Claimable' by the Beneficiary.

### What is a Check-in?
Check-ins are an implementation of a 'dead man switch' in Inheritor. By checking in regularly, the smart contract knows that you are OK. When you miss a check-in, the smart contract will assume something is wrong with you, and then will make the Inheritances available to the designated Beneficiaries in accordance with the Legacy Settings.

### What is a smart contract?
A smart contract is a computer program or transaction protocol that automatically executes, controls, or documents events and actions according to the terms of a contract or agreement. In Inheritor, your Digital Will is embedded in a smart contract between you and the beneficiaries placed on one of the supported Networks. Smart contracts are ideal to execute Digital Wills, as they are immutable, distributed, and censorship-resistant, among other properties.

### What are Legacy Settings?
Inheritor offers several settings that help determine if and when your Digital Will is executed.

## Verifiers

### What is a Verifier?
A Verifier is any person who can 'verify' your wellbeing. You can assign any Beneficiary to become a Verifier. Normally these are close relatives.

### Why should I add a Verifier?
Assigning a Verifier provides an extra level of protection to ensure your Digital Will is only executed when you have become irrevocably incapacitated. On top of the normal Check-in, a human being has to verify your wellbeing before the Digital Will is executed. Note also that Verifiers will not receive any Inheritances until they confirm the incapacitation of the Testator.

### I am a Verifier. Inheritor asks me to verify the wellbeing of a family member. However, they are doing ok. What should I do?
Ask your family member (the Testator) to Check-in. Then all will be reset to normal.

### I am a Verifier of a family member who passed away. What should I do?
You will see that your Inheritance has been marked with a checkmark to indicate that you are indeed a verifier. Just click 'verify claimability'. When the Testator has missed their check-in due to passing away, you will see a message. Next, click the 'Verification Required' button to confirm the death (or irrevocable incapacitation) of the Testator. After the Transaction succeeds, you and all other Beneficiaries will receive their Inheritance after its Grace Period has expired.

## Inheritance Management

### An Inheritance has become 'Claimable'. What should I do?
Carefully read and follow the instructions in the Inheritor app. It is very important that you save the Digital Asset you Inherited before you set the status of your Inheritance to Claimed.

### What is a Transaction?
A transaction is any operation in Inheritor that changes your Digital Will. That includes creating a new Inheritance, removing one, Check-in, adding a Verifier, or any operation that potentially will change the 'state' of an Inheritance (e.g., verify its claimability), etc. As your Digital Will is stored in a smart contract on the blockchain, any transaction incurs costs (gas fees), that you either pay via your subscription (your Digital Will on Arbitrum) or via Credits (your Digital Will on Ethereum).

### What are Credits?
In Inheritor, you use Credits to pay (gas) fees related to Transactions. The amount of Credits you need to pay for each Transaction varies and depends on 'how busy' the network is (among other factors). Before you submit a transaction (e.g., a Check-in), you will be informed how many Credits the Transaction will require. Normally this should be no more than 1 or 2 Credits. If it is more, try to do the Transaction at another time to save Credits.

## Technical Identifiers

### What is an (Inheritance) ID?
The ID is a unique number that identifies each Inheritance.

### What is 'Contract Address'?
The Contract Address is the 'address' where the smart contract containing your Digital Will lives on the blockchain.

### What is 'Transaction Hash'?
This is a unique identifier of the Transaction that created a particular Inheritance in your Digital Will.

### What is (Inheritance) 'State'?
In the lifecycle of an Inheritance, it can have different states. [Note: The original text didn't list the states]

### What is EOA (Testator / Beneficiary)?
This means the Ethereum Original Address (of Testator). This is a unique number that identifies the Testator on the network. With Inheritor, you (as user) can adopt two roles: one as Testator, and one as Beneficiary of Inheritances. To create maximum security, the two roles are separated; hence, you (as user) will have been assigned an EOA for your role as Testator and for your role as Beneficiary.

### What is 'Smart Account' (Testator / Beneficiary)?
A Smart Account is a smart contract wallet that follows the ERC-4337 specification. This protocol allows Inheritor to pay for Transactions on your behalf. Smart accounts are just smart contracts with specific tasks. These contracts are created when you first open Inheritor (on Arbitrum One), or when you upgrade to the Premium tier (on Ethereum) during 'Premium Activation'. With Inheritor, you (as user) can adopt two roles: one as Testator, and one as Beneficiary of Inheritances. To create maximum security, the two roles are separated; hence, you (as user) will have been assigned a Smart Account for your role as Testator and for your role as Beneficiary.

### What is 'Arweave ID'?
This is a unique ID under which your Digital Asset is stored (encrypted) on the Arweave Blockchain (BlockWeave). You can verify the presence of your Digital Asset when you click the Arweave ID. Note that the Digital Asset is encrypted such that it can only be decrypted by the Beneficiary. Though the Digital Asset is on the 'public' blockchain (all blockchains and the data they store are publicly accessible), nobody except the Beneficiary can view its contents (see our White Paper).

## Troubleshooting

### How can I backup my data?
Inheritor automatically updates your data on your phone. However, that is not helpful if you lose or break your phone. Follow our 'practical condideration' guidelines to make sure you always can always access a backup.

### When I view an Inheritance the app shows 'Digital Asset preview disabled for security reasons. You might have restored a backup.' What does this mean?

For security reasons, Inheritor does not back up your Digital Assets as they might contain sensitive data. When this message appears, you have most likely restored a backup which makes a preview of the asset unavailable.
If you want to be able to view the asset again in the app, you'll need to revoke the Inheritance and create a new one selecting the same (or similar) asset.
Note that the Inheritor app requires FaceID authentication to show Digital Assets as an additional security measure.

### I lost/broke my iPhone. What do I do?
If you have lost or permanently damaged your phone, then in most cases you would buy a new iPhone. iOS will be able to restore your new iPhone, and you can then continue to use Inheritor without issue.

### I purchased a new phone, what should I do?
When you restore your new phone, all data, including private keys (stored in Keychain), will be restored. After the restore process is complete, you can continue using Inheritor where you left off.

### I don't use iCloud backup and purchased a new phone, what should I do?
Reinstall Inheritor on your new phone. Restore the private keys using the recovery phrase, then restore the backup. After restarting Inheritor, you can proceed where you left off.

### I am (or will be) in a remote area where I cannot access the Internet (or my iPhone). What do I do?
Make sure you set the Check-in frequency to a long period (like 1, 2, or 3 months) before you leave. That ensures your Digital Will will not be executed during that period.

### I unexpectedly cannot access the Internet or my iPhone, and I urgently need to Check-in. What do I do?
Please contact us. Please realize that setting a sufficient 'Grace Period' for Inheritances is meant to address these cases. Everybody can lose access to their iPhone or Internet unexpectedly, but setting a grace period of at least a week should avoid issues.

### My spouse is using Inheritor and became incapacitated. They will be in a hospital probably for a long time (coma). However, doctors say they are not irrevocably incapacitated. What do I do?
To avoid problems with your Digital Will executing prematurely in these types of situations, we have created the concept of a 'Verifier' available in the Premium subscription. Assigning a Verifier will always require a human confirmation of the state of the Testator before the Digital Will is executed.

## Contingency Planning

### What should I do when something happens with the developers of Inheritor, or even Apple?
The correct execution of your Digital Will is not dependent on us or any of our systems. As long as you have Inheritor installed on your iPhone, you can use it to update your Digital Will and to check-in. However, as Inheritor relies on subscriptions and in-app purchases (via Apple), Apple might stop serving these at some point. For this (remote) case, we provide a mitigation process that ensures you can Check-In or revoke Inheritances without using our app, but via the use of public domain/free software tools. This ensures that Digital Assets are not transferred prematurely.

### What should I do when something happens with Ethereum, Arbitrum, or Arweave?
Like the Internet, these blockchain networks are distributed and mainly 'unstoppable'. Their disappearance could only be the result of a major global disruption. However, if the unthinkable happens, it is best to revoke all your Inheritances either using our app or via our mitigation process.

## Error Handling

### Inheritor Shows "Initialization Error" during startup. What should I do?
This can happen in cases of very high traffic on the blockchain network. It indicates too many requests are being received by the network. You can simply quit the app and try again later.

### Inheritor Shows an other error. What should I do?
Please just try whatever you were doing again. Blockchains are complex technologies, and unpredictable situations can occur. Make sure you have a good working Internet connection or restart the app. Contact support@inheritor.app when all options fail.
