const fs = require("node:fs");
const path = require("node:path");
const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const Registry = await ethers.getContractFactory("CertificateRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const deployment = {
    contractAddress: address,
    chainId,
    network: network.name,
    deployer: deployer.address
  };
  const output = path.join(__dirname, "..", "frontend", "deployment.json");
  fs.writeFileSync(output, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(`CertificateRegistry deployed at ${address}`);
  console.log(`Network: ${network.name} (chain ID ${chainId})`);
  console.log(`Frontend deployment config written to ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
