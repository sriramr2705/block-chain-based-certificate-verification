const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const { certificateDigest } = require("./certificate");

const ROOT = path.join(__dirname, "..");
const DEPLOYMENT_PATH = path.join(ROOT, "frontend", "deployment.json");
const DASHBOARD_PATH = path.join(__dirname, "dashboard.html");
const ABI = [
  "function verifyCertificate(bytes32 digest) view returns (bool exists, address issuer, uint64 issuedAt, bool revoked)",
  "event CertificateIssued(bytes32 indexed digest, address indexed issuer, uint64 issuedAt)",
  "event CertificateRevoked(bytes32 indexed digest, address indexed revokedBy)"
];
const PORT = Number(process.env.API_PORT || 3001);
const HOST = process.env.API_HOST || "127.0.0.1";
const ALLOWED_ORIGINS = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);

function readDeployment() {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(DEPLOYMENT_PATH, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const contractAddress = process.env.CONTRACT_ADDRESS || fileConfig.contractAddress;
  if (!contractAddress || !ethers.isAddress(contractAddress)) {
    throw new Error(`No valid contract address. Deploy the contract or set CONTRACT_ADDRESS. Expected config: ${DEPLOYMENT_PATH}`);
  }
  return {
    contractAddress,
    chainId: Number(process.env.CHAIN_ID || fileConfig.chainId || 31337),
    rpcUrl: process.env.RPC_URL || "http://127.0.0.1:8545"
  };
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function setCors(request, response) {
  const origin = request.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 16_384) {
        reject(Object.assign(new Error("Request body is too large."), { statusCode: 413 }));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        reject(Object.assign(new Error("Request body must be valid JSON."), { statusCode: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function createServer() {
  const config = readDeployment();
  const dashboardHtml = fs.readFileSync(DASHBOARD_PATH, "utf8");
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  const registry = new ethers.Contract(config.contractAddress, ABI, provider);

  return http.createServer(async (request, response) => {
    setCors(request, response);
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && url.pathname === "/") {
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache"
      });
      response.end(dashboardHtml);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true, chainId: config.chainId, contractAddress: config.contractAddress });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/certificates") {
      try {
        const [issuedEvents, revokedEvents] = await Promise.all([
          registry.queryFilter(registry.filters.CertificateIssued(), 0, "latest"),
          registry.queryFilter(registry.filters.CertificateRevoked(), 0, "latest")
        ]);
        const revokedDigests = new Set(revokedEvents.map((event) => event.args.digest.toLowerCase()));
        const certificates = issuedEvents
          .map((event) => ({
            digest: event.args.digest,
            issuer: event.args.issuer,
            issuedAt: Number(event.args.issuedAt),
            revoked: revokedDigests.has(event.args.digest.toLowerCase()),
            blockNumber: event.blockNumber,
            transactionIndex: event.transactionIndex
          }))
          .sort((first, second) => second.blockNumber - first.blockNumber
            || second.transactionIndex - first.transactionIndex)
          .map(({ digest, issuer, issuedAt, revoked }) => ({ digest, issuer, issuedAt, revoked }));
        sendJson(response, 200, { certificates });
      } catch {
        sendJson(response, 503, {
          error: "Could not read the certificate registry. Check that the blockchain node is running."
        });
      }
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/verify") {
      response.setHeader("Allow", "POST");
      sendJson(response, 405, { error: "Use POST /api/verify with certificate fields and verification key." });
      return;
    }
    if (request.method !== "POST" || url.pathname !== "/api/verify") {
      sendJson(response, 404, { error: "API route not found." });
      return;
    }

    try {
      if (!String(request.headers["content-type"] || "").includes("application/json")) {
        sendJson(response, 415, { error: "Content-Type must be application/json." });
        return;
      }
      const body = await readJson(request);
      const digest = certificateDigest(body.fields, body.secret);
      const [exists, issuer, issuedAt, revoked] = await registry.verifyCertificate(digest);
      if (!exists) {
        sendJson(response, 200, { status: "not_found" });
      } else {
        sendJson(response, 200, {
          status: revoked ? "revoked" : "valid",
          issuer,
          issuedAt: Number(issuedAt)
        });
      }
    } catch (error) {
      const statusCode = error.statusCode || (error instanceof TypeError ? 400 : 503);
      sendJson(response, statusCode, {
        error: statusCode === 503 ? "Could not read the certificate registry. Check that the blockchain node is running." : error.message
      });
    }
  });
}

if (require.main === module) {
  try {
    const server = createServer();
    server.listen(PORT, HOST, () => console.log(`Certificate API listening at http://${HOST}:${PORT}`));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { createServer, readDeployment };
