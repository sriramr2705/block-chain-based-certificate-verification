const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CertificateRegistry", function () {
  async function deploy() {
    const [owner, issuer, stranger] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("CertificateRegistry");
    const registry = await Registry.deploy();
    const digest = ethers.keccak256(ethers.toUtf8Bytes("opaque certificate digest"));
    return { registry, owner, issuer, stranger, digest };
  }

  it("lets the owner issue a digest and returns public status", async function () {
    const { registry, owner, digest } = await deploy();
    await expect(registry.issueCertificate(digest)).to.emit(registry, "CertificateIssued");
    const [exists, issuer, issuedAt, revoked] = await registry.verifyCertificate(digest);
    expect(exists).to.equal(true);
    expect(issuer).to.equal(owner.address);
    expect(issuedAt).to.be.greaterThan(0);
    expect(revoked).to.equal(false);
  });

  it("allows only owner-authorized issuers to issue", async function () {
    const { registry, issuer, stranger, digest } = await deploy();
    await expect(registry.connect(stranger).issueCertificate(digest)).to.be.revertedWithCustomError(registry, "NotIssuer");
    await registry.setIssuer(issuer.address, true);
    await registry.connect(issuer).issueCertificate(digest);
    const [, recordedIssuer] = await registry.verifyCertificate(digest);
    expect(recordedIssuer).to.equal(issuer.address);
  });

  it("rejects duplicate and zero digests", async function () {
    const { registry, digest } = await deploy();
    await expect(registry.issueCertificate(ethers.ZeroHash)).to.be.revertedWithCustomError(registry, "InvalidDigest");
    await registry.issueCertificate(digest);
    await expect(registry.issueCertificate(digest)).to.be.revertedWithCustomError(registry, "AlreadyIssued");
  });

  it("permits the original issuer or owner to revoke, but nobody else", async function () {
    const { registry, owner, issuer, stranger, digest } = await deploy();
    await registry.setIssuer(issuer.address, true);
    await registry.connect(issuer).issueCertificate(digest);
    await expect(registry.connect(stranger).revokeCertificate(digest)).to.be.revertedWithCustomError(registry, "NotCertificateIssuer");
    await registry.connect(issuer).revokeCertificate(digest);
    const [exists, , , revoked] = await registry.verifyCertificate(digest);
    expect(exists).to.equal(true);
    expect(revoked).to.equal(true);
    await expect(registry.connect(owner).revokeCertificate(digest)).to.be.revertedWithCustomError(registry, "AlreadyRevoked");
  });

  it("reports unknown digests as absent", async function () {
    const { registry } = await deploy();
    const [exists, issuer, issuedAt, revoked] = await registry.verifyCertificate(ethers.ZeroHash);
    expect([exists, issuer, issuedAt, revoked]).to.deep.equal([false, ethers.ZeroAddress, 0n, false]);
  });
});
