const ABI = [
  "function owner() view returns (address)",
  "function issuers(address) view returns (bool)",
  "function setIssuer(address account, bool enabled)",
  "function issueCertificate(bytes32 digest)",
  "function revokeCertificate(bytes32 digest)",
  "function verifyCertificate(bytes32 digest) view returns (bool exists, address issuer, uint64 issuedAt, bool revoked)"
];

const $ = (selector) => document.querySelector(selector);
const connectButton = $("#connect-wallet");
const connectionStatus = $("#connection-status");
const message = $("#message");
const warning = $("#network-warning");
const apiWarning = $("#api-warning");
const issueForm = $("#issue-form");
const verifyForm = $("#verify-form");
const issuerForm = $("#issuer-form");
const issuedKey = $("#issued-key");
const verificationResult = $("#verification-result");
const certificateList = $("#certificate-list");
const certificateListStatus = $("#certificate-list-status");
const certificateTable = $(".certificate-table-wrap");
const refreshCertificatesButton = $("#refresh-certificates");
let ethersLib;
let deployment;
let provider;
let signer;
let contract;
let account;

async function boot() {
  [ethersLib, deployment] = await Promise.all([
    import("ethers"),
    fetch("/deployment.json").then((response) => response.ok ? response.json() : null).catch(() => null)
  ]);
  if (!deployment?.contractAddress) {
    warning.hidden = false;
    warning.textContent = "No contract is configured yet. Follow the local setup steps in README.md, deploy the contract, and reload this page.";
  }
  fetch("/api/health").then((response) => {
    if (!response.ok) throw new Error("API unavailable");
    return response.json();
  }).then((health) => {
    if (deployment?.chainId && Number(health.chainId) !== Number(deployment.chainId)) {
      apiWarning.hidden = false;
      apiWarning.textContent = "The API is connected to a different chain than the frontend. Check the backend RPC_URL and CHAIN_ID.";
    }
  }).catch(() => {
    apiWarning.hidden = false;
    apiWarning.textContent = "The certificate API is not running. Start it with npm run backend, then reload this page.";
  });
  await loadCertificates();
  if (!window.ethereum) {
    connectionStatus.textContent = "Install a wallet to issue records";
    connectButton.disabled = true;
  } else {
    window.ethereum.on?.("accountsChanged", () => window.location.reload());
    window.ethereum.on?.("chainChanged", () => window.location.reload());
  }
}

async function loadCertificates() {
  refreshCertificatesButton.disabled = true;
  certificateListStatus.textContent = "Loading certificate records…";
  certificateListStatus.hidden = false;
  certificateTable.hidden = true;
  try {
    const response = await fetch("/api/certificates");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not load certificate records.");
    if (!Array.isArray(result.certificates)) throw new Error("The certificate API returned an invalid record list.");

    certificateList.replaceChildren();
    for (const certificate of result.certificates) {
      const row = document.createElement("tr");
      const reference = document.createElement("td");
      const digest = document.createElement("code");
      digest.textContent = `${certificate.digest.slice(0, 10)}…${certificate.digest.slice(-8)}`;
      digest.title = certificate.digest;
      const copyButton = document.createElement("button");
      copyButton.type = "button";
      copyButton.className = "copy-reference";
      copyButton.textContent = "Copy";
      copyButton.setAttribute("aria-label", "Copy full record reference");
      copyButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(certificate.digest);
          showMessage("Record reference copied to clipboard.", "success");
        } catch (error) {
          showMessage(`Could not copy record reference: ${error.message}`, "error");
        }
      });
      reference.append(digest, copyButton);

      const issuer = document.createElement("td");
      issuer.textContent = `${certificate.issuer.slice(0, 8)}…${certificate.issuer.slice(-6)}`;
      issuer.title = certificate.issuer;

      const issued = document.createElement("td");
      issued.textContent = new Date(certificate.issuedAt * 1000).toLocaleString();

      const status = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = `certificate-status ${certificate.revoked ? "revoked" : "active"}`;
      badge.textContent = certificate.revoked ? "Revoked" : "Valid";
      status.append(badge);
      row.append(reference, issuer, issued, status);
      certificateList.append(row);
    }

    certificateTable.hidden = result.certificates.length === 0;
    certificateListStatus.textContent = result.certificates.length
      ? `${result.certificates.length} certificate record${result.certificates.length === 1 ? "" : "s"} found.`
      : "No certificate records have been issued yet.";
  } catch (error) {
    certificateListStatus.textContent = error.message;
  } finally {
    certificateListStatus.hidden = false;
    refreshCertificatesButton.disabled = false;
  }
}

refreshCertificatesButton.addEventListener("click", loadCertificates);

function showMessage(text, kind = "success") {
  message.className = `notice notice-${kind}`;
  message.textContent = text;
  message.hidden = false;
}

function normalizedFields(formData) {
  const clean = (value) => String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
  return {
    holder: clean(formData.get("holder")),
    certificateId: clean(formData.get("certificateId")),
    qualification: clean(formData.get("qualification")),
    institution: clean(formData.get("institution")),
    issueDate: clean(formData.get("issueDate"))
  };
}

function newSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function certificateDigest(fields, secret) {
  const messageBytes = new TextEncoder().encode(`${secret}:${JSON.stringify(fields)}`);
  const digest = await crypto.subtle.digest("SHA-256", messageBytes);
  return `0x${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function openCertificate(fields, transactionHash) {
  const certificateWindow = window.open("", "_blank");
  if (!certificateWindow) throw new Error("Allow pop-ups to print or save the certificate.");
  certificateWindow.opener = null;
  certificateWindow.document.write(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>ClearCert — ${escapeHtml(fields.certificateId)}</title>
        <style>
          *{box-sizing:border-box}
          @page{size:A4 landscape;margin:0}
          body{margin:0;background:#e9ece6;color:#18392e;font-family:Georgia,"Times New Roman",serif}
          .certificate{position:relative;width:297mm;height:210mm;margin:20px auto;padding:18mm;background:#fffdf7;box-shadow:0 14px 50px #18392e24}
          .frame{height:100%;border:2px solid #285442;padding:7mm;position:relative}
          .inner-frame{height:100%;border:1px solid #b4c7a5;padding:12mm 18mm;text-align:center;position:relative}
          .brand{font:700 11px Arial,sans-serif;letter-spacing:4px;text-transform:uppercase;color:#496c4d}
          .rule{width:38mm;height:2px;background:#b8ce8c;margin:7mm auto}
          h1{font-size:12mm;font-weight:400;letter-spacing:1px;margin:0;color:#18392e}
          .intro{font:12px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#788374;margin:8mm 0 4mm}
          .holder{font-size:17mm;line-height:1.1;color:#315b43;margin:0 0 5mm}
          .description{font:14px/1.7 Arial,sans-serif;color:#566157;margin:0}
          .qualification{font-size:8mm;color:#18392e;margin:2mm 0}
          .details{display:flex;justify-content:center;gap:24mm;margin-top:11mm;font:11px Arial,sans-serif;color:#596458}
          .details strong{display:block;font:700 10px Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:#315b43;margin-bottom:2mm}
          .seal{position:absolute;right:12mm;bottom:10mm;width:22mm;height:22mm;border:1px solid #9ab17b;border-radius:50%;display:grid;place-items:center;color:#315b43;font:700 8px/1.3 Arial,sans-serif;letter-spacing:1px}
          .footer{position:absolute;left:10mm;right:10mm;bottom:5mm;font:8px Arial,sans-serif;color:#849080;overflow-wrap:anywhere}
          .print-button{position:fixed;top:16px;right:16px;border:0;border-radius:6px;padding:12px 16px;background:#153c31;color:#fff;font:600 13px Arial,sans-serif;cursor:pointer}
          @media print{body{background:#fff}.certificate{margin:0;box-shadow:none}.print-button{display:none}}
          @media screen and (max-width:800px){.certificate{transform-origin:top left;transform:scale(.65);margin:0}}
        </style>
      </head>
      <body>
        <button class="print-button" type="button" onclick="window.print()">Print / Save as PDF</button>
        <main class="certificate">
          <div class="frame"><div class="inner-frame">
            <div class="brand">ClearCert · Digital Credential</div>
            <div class="rule"></div>
            <h1>Certificate of Achievement</h1>
            <p class="intro">This certificate is proudly presented to</p>
            <p class="holder">${escapeHtml(fields.holder)}</p>
            <p class="description">for successfully completing</p>
            <p class="qualification">${escapeHtml(fields.qualification)}</p>
            <p class="description">awarded by ${escapeHtml(fields.institution)}</p>
            <div class="details">
              <div><strong>Certificate ID</strong>${escapeHtml(fields.certificateId)}</div>
              <div><strong>Date issued</strong>${escapeHtml(fields.issueDate)}</div>
            </div>
            <div class="seal">ON-CHAIN<br />RECORD</div>
            <div class="footer">Transaction: ${escapeHtml(transactionHash)}</div>
          </div></div>
        </main>
      </body>
    </html>`);
  certificateWindow.document.close();
}

async function connectWallet() {
  if (!window.ethereum) throw new Error("A browser wallet such as MetaMask is required.");
  if (!deployment?.contractAddress) throw new Error("Deploy the contract and reload this page first.");
  provider = new ethersLib.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = await provider.getSigner();
  account = await signer.getAddress();
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== Number(deployment.chainId)) {
    throw new Error(`Wrong network. Switch your wallet to ${deployment.network} (chain ID ${deployment.chainId}).`);
  }
  contract = new ethersLib.Contract(deployment.contractAddress, ABI, signer);
  connectionStatus.textContent = `${account.slice(0, 6)}…${account.slice(-4)}`;
  connectButton.textContent = "Wallet connected";
}

connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  try {
    await connectWallet();
    showMessage(`Connected to ${account}.`, "success");
  } catch (error) {
    showMessage(error.shortMessage || error.message, "error");
  } finally {
    connectButton.disabled = false;
  }
});

issueForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = issueForm.querySelector("button[type=submit]");
  button.disabled = true;
  issuedKey.hidden = true;
  try {
    if (!contract) await connectWallet();
    const allowed = await contract.issuers(account);
    if (!allowed) throw new Error("This wallet is not an approved issuer. Ask the contract owner to approve it.");
    const fields = normalizedFields(new FormData(issueForm));
    const secret = newSecret();
    const digest = await certificateDigest(fields, secret);
    const tx = await contract.issueCertificate(digest);
    showMessage("Waiting for the issuance transaction to be confirmed…", "success");
    await tx.wait();
    issuedKey.innerHTML = `<strong>Certificate issued</strong><div>Share this verification key securely with the holder. It cannot be recovered later.</div><p class="key-value"></p><div class="key-actions"><button type="button" id="copy-key">Copy key</button><button type="button" id="download-key">Download key file</button><button type="button" id="print-certificate">Print certificate</button></div>`;
    issuedKey.querySelector(".key-value").textContent = secret;
    issuedKey.hidden = false;
    $("#copy-key").addEventListener("click", async () => {
      await navigator.clipboard.writeText(secret);
      showMessage("Verification key copied to clipboard.", "success");
    });
    $("#download-key").addEventListener("click", () => {
      const blob = new Blob([`ClearCert verification key\n${secret}\n`], { type: "text/plain" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${fields.certificateId || "certificate"}-verification-key.txt`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
    $("#print-certificate").addEventListener("click", () => {
      try {
        openCertificate(fields, tx.hash);
      } catch (error) {
        showMessage(error.message, "error");
      }
    });
    showMessage(`Certificate issued in transaction ${tx.hash}. Keep the key safe and share it privately.`, "success");
    issueForm.reset();
    await loadCertificates();
  } catch (error) {
    showMessage(error.shortMessage || error.reason || error.message, "error");
  } finally {
    button.disabled = false;
  }
});

verifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = verifyForm.querySelector("button[type=submit]");
  button.disabled = true;
  verificationResult.hidden = true;
  try {
    const fields = normalizedFields(new FormData(verifyForm));
    const secret = String(new FormData(verifyForm).get("secret")).trim().toLowerCase();
    const response = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields, secret })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Verification request failed.");

    const titles = { not_found: "No matching record found", valid: "Record found · valid", revoked: "Record found · revoked" };
    const valid = result.status === "valid";
    verificationResult.className = `result-card ${valid ? "valid" : "invalid"}`;
    verificationResult.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = titles[result.status] || "Unexpected API response";
    verificationResult.append(heading);
    if (result.status === "not_found") {
      const detail = document.createElement("p");
      detail.textContent = "Check the certificate details and verification key, then try again.";
      verificationResult.append(detail);
    } else if (result.status === "valid" || result.status === "revoked") {
      const issuerLine = document.createElement("p");
      issuerLine.textContent = `${result.status === "revoked" ? "Revoked record. Issuer:" : "Issued by"} ${result.issuer}`;
      const dateLine = document.createElement("p");
      dateLine.textContent = `On ${new Date(Number(result.issuedAt) * 1000).toLocaleString()}`;
      verificationResult.append(issuerLine, dateLine);
    }
    verificationResult.hidden = false;
  } catch (error) {
    showMessage(error.shortMessage || error.reason || error.message, "error");
  } finally {
    button.disabled = false;
  }
});

issuerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = issuerForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    if (!contract) await connectWallet();
    const owner = await contract.owner();
    if (owner.toLowerCase() !== account.toLowerCase()) throw new Error("Only the contract owner can approve issuers.");
    const address = new FormData(issuerForm).get("issuerAddress").trim();
    if (!ethersLib.isAddress(address)) throw new Error("Enter a valid wallet address.");
    const tx = await contract.setIssuer(address, true);
    await tx.wait();
    issuerForm.reset();
    showMessage(`Issuer ${address} approved.`, "success");
  } catch (error) {
    showMessage(error.shortMessage || error.reason || error.message, "error");
  } finally {
    button.disabled = false;
  }
});

boot().catch((error) => showMessage(error.message, "error"));
