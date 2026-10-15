# ClearCert — Certificate Verification Starter

A local-first certificate registry starter built with Solidity, Hardhat, a separate Node.js HTTP API, ethers.js, and a plain HTML/CSS/JavaScript frontend. It demonstrates issuing and verifying tamper-evident certificate records without putting names, certificate numbers, or other personal details on-chain.

## What it does

- An owner account can approve issuer wallet addresses.
- Approved issuers create certificates by registering a `bytes32` digest.
- The browser generates a random 256-bit verification key for every issue and hashes it with normalized certificate fields. The key is shown once and must be shared privately with the certificate holder.
- After a successful issue, the issuer can generate a styled, printable certificate and save it as a PDF from the browser print dialog. The certificate includes the issue details and transaction reference, but not the private verification key.
- Anyone with the certificate fields and key can check whether the matching record exists and whether it has been revoked.
- The frontend lists public on-chain record references, issuer addresses, issue times, and revocation status. It cannot list holder names or certificate details because those are not stored on-chain.
- A separate backend API validates verification requests, computes the digest, and reads the registry through the blockchain RPC endpoint. The API is stateless and does not retain certificate details or verification keys.
- The original issuer or contract owner can revoke a record.
- Contract tests cover permissions, issuance, duplicate and zero digests, verification, and revocation. Backend tests cover field normalization and digest validation.

## Requirements

- Node.js 20 or newer (includes npm)
- MetaMask or another EIP-1193 browser wallet

## Run locally

Install dependencies from this directory:

```sh
npm install
npm test
npm run test:backend
```

Open four terminals in this directory and leave each running:

**Terminal 1 — start the local Hardhat chain**

```sh
npm run node
```

**Terminal 2 — deploy the registry**

```sh
npm run deploy:local
```

The deployment script writes the address and chain ID to `frontend/deployment.json` (this generated local file is git-ignored).

**Terminal 3 — start the backend API**

```sh
npm run backend
```

The API listens on `http://127.0.0.1:3001`. It reads the deployed contract address from `frontend/deployment.json`. Optional backend environment variables are `RPC_URL`, `CONTRACT_ADDRESS`, `CHAIN_ID`, `API_HOST`, and `API_PORT`. If you change the API port, set `API_URL` for Vite to the matching backend URL.

Open <http://127.0.0.1:3001> to view the backend registry dashboard. It lists public record references, issuer addresses, issue times, and revocation status; private certificate details are not stored on-chain.

**Terminal 4 — start the frontend**

```sh
npm run frontend
```

Open <http://127.0.0.1:5173>. In MetaMask, add or select the local network with RPC URL `http://127.0.0.1:8545`, chain ID `31337`, and currency symbol `ETH`. For local development only, import one of the test accounts and private keys printed by `npm run node` into MetaMask. Those keys are public test keys; never fund or reuse them on a real network.

The deployer account is the initial owner and issuer. To issue from another account, connect as the owner, expand **Issuer administration**, and approve the issuer wallet address. Then connect as that approved issuer and submit the issuance form. Issuance transactions are signed in the browser wallet; the API never receives issuer private keys. Public verification goes through the backend API and does not require a wallet connection, but both the API and local node must be running.

## Tests and build

```sh
npm test
npm run test:backend
npm run compile
npm run build:frontend
```

The contract tests live in `test/CertificateRegistry.js`; backend validation and digest tests live in `backend/certificate.test.js`.

## Privacy and security limits

- No certificate holder details or verification keys are written to the contract. Only a salted digest, the issuing wallet, timestamp, and revocation state are recorded.
- The verification key is a bearer secret. Share it only through a trusted private channel and retain a secure copy. If it is lost, that certificate cannot be verified through this demo; if exposed, someone can attempt to verify the matching details.
- Blockchain transactions, issuer addresses, timestamps, and digests are public and permanent. A random key makes offline guessing of certificate details impractical, but does not hide who issued a record or when.
- The API is stateless and does not log or save verification requests. It still receives the submitted certificate details and key in memory to compute the digest; use HTTPS and appropriate operational protections before exposing it outside local development.
- This starter does not establish whether an issuer is legally recognized, whether the submitted information is true, or whether a wallet belongs to an institution. It does not provide identity proofing, account recovery, a production key-management process, or a compliance review.
- The local Hardhat network is for development only. Before any public deployment, obtain a security audit, decide how issuers and ownership will be governed, protect admin keys, assess privacy and legal obligations, and plan for contract upgrades or migration. Public-chain deployment has irreversible and ongoing costs.

This code is an educational starter, not a production-ready credential platform.
