const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCertificateFields, certificateDigest } = require("./certificate");

const fields = {
  holder: "  Alex   Morgan ",
  certificateId: "CERT-2026-0142",
  qualification: "Diploma in Design",
  institution: "Northstar Institute",
  issueDate: "2026-10-14"
};
const secret = "a".repeat(64);

test("normalizes whitespace and Unicode consistently", () => {
  const normalized = normalizeCertificateFields(fields);
  assert.equal(normalized.holder, "Alex Morgan");
  assert.equal(normalized.certificateId, fields.certificateId);
  assert.equal(normalizeCertificateFields({ ...fields, holder: "A\u0301lex Morgan" }).holder, "Álex Morgan");
});

test("creates a stable 32-byte certificate digest", () => {
  const digest = certificateDigest(fields, secret);
  assert.match(digest, /^0x[a-f0-9]{64}$/);
  assert.equal(digest, certificateDigest({ ...fields, holder: "Alex Morgan" }, secret));
});

test("changes the digest when the key or certificate details change", () => {
  assert.notEqual(certificateDigest(fields, secret), certificateDigest(fields, "b".repeat(64)));
  assert.notEqual(certificateDigest(fields, secret), certificateDigest({ ...fields, qualification: "Other" }, secret));
});

test("rejects missing fields, invalid dates, and malformed keys", () => {
  assert.throws(() => normalizeCertificateFields({ ...fields, institution: " " }), /Missing certificate field/);
  assert.throws(() => normalizeCertificateFields({ ...fields, issueDate: "14-10-2026" }), /YYYY-MM-DD/);
  assert.throws(() => certificateDigest(fields, "short-key"), /64-character hexadecimal/);
});
