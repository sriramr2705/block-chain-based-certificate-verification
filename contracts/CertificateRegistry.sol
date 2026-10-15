// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Stores only opaque certificate digests and issuance metadata.
/// Personal details and verification secrets belong off-chain.
contract CertificateRegistry {
    struct Certificate {
        address issuer;
        uint64 issuedAt;
        bool revoked;
    }

    address public owner;
    mapping(address => bool) public issuers;
    mapping(bytes32 => Certificate) private certificates;

    event IssuerUpdated(address indexed issuer, bool enabled);
    event CertificateIssued(bytes32 indexed digest, address indexed issuer, uint64 issuedAt);
    event CertificateRevoked(bytes32 indexed digest, address indexed revokedBy);

    error NotOwner();
    error NotIssuer();
    error ZeroAddress();
    error InvalidDigest();
    error AlreadyIssued();
    error UnknownCertificate();
    error AlreadyRevoked();
    error NotCertificateIssuer();

    constructor() {
        owner = msg.sender;
        issuers[msg.sender] = true;
        emit IssuerUpdated(msg.sender, true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyIssuer() {
        if (!issuers[msg.sender]) revert NotIssuer();
        _;
    }

    function setIssuer(address account, bool enabled) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        issuers[account] = enabled;
        emit IssuerUpdated(account, enabled);
    }

    function issueCertificate(bytes32 digest) external onlyIssuer {
        if (digest == bytes32(0)) revert InvalidDigest();
        if (certificates[digest].issuedAt != 0) revert AlreadyIssued();
        uint64 issuedAt = uint64(block.timestamp);
        certificates[digest] = Certificate({issuer: msg.sender, issuedAt: issuedAt, revoked: false});
        emit CertificateIssued(digest, msg.sender, issuedAt);
    }

    function revokeCertificate(bytes32 digest) external {
        Certificate storage certificate = certificates[digest];
        if (certificate.issuedAt == 0) revert UnknownCertificate();
        if (msg.sender != owner && msg.sender != certificate.issuer) revert NotCertificateIssuer();
        if (certificate.revoked) revert AlreadyRevoked();
        certificate.revoked = true;
        emit CertificateRevoked(digest, msg.sender);
    }

    function verifyCertificate(bytes32 digest)
        external
        view
        returns (bool exists, address issuer, uint64 issuedAt, bool revoked)
    {
        Certificate memory certificate = certificates[digest];
        exists = certificate.issuedAt != 0;
        return (exists, certificate.issuer, certificate.issuedAt, certificate.revoked);
    }
}
