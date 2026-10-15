const { createHash } = require("node:crypto");

const FIELD_LIMITS = {
  holder: 120,
  certificateId: 80,
  qualification: 120,
  institution: 120,
  issueDate: 10
};

function normalizeCertificateFields(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Certificate fields are required.");
  }

  const fields = {};
  for (const [name, maxLength] of Object.entries(FIELD_LIMITS)) {
    const value = input[name];
    if (typeof value !== "string") throw new TypeError(`Missing certificate field: ${name}.`);
    const cleaned = value.normalize("NFC").trim().replace(/\s+/g, " ");
    if (!cleaned) throw new TypeError(`Missing certificate field: ${name}.`);
    if (cleaned.length > maxLength) throw new TypeError(`Certificate field is too long: ${name}.`);
    fields[name] = cleaned;
  }

  const parsedDate = new Date(`${fields.issueDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.issueDate)
      || Number.isNaN(parsedDate.getTime())
      || parsedDate.toISOString().slice(0, 10) !== fields.issueDate) {
    throw new TypeError("Issue date must use YYYY-MM-DD format.");
  }

  return fields;
}

function certificateDigest(fields, secret) {
  if (typeof secret !== "string" || !/^[a-f\d]{64}$/i.test(secret)) {
    throw new TypeError("Verification key must be a 64-character hexadecimal value.");
  }
  const canonical = JSON.stringify(normalizeCertificateFields(fields));
  return `0x${createHash("sha256").update(`${secret.toLowerCase()}:${canonical}`, "utf8").digest("hex")}`;
}

module.exports = { normalizeCertificateFields, certificateDigest };
