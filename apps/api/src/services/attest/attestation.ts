import { type Bytes, bytesEqual, concat, sha256, toBase64, utf8 } from "../../lib/encoding/bytes";
import { type CborValue, decodeCbor, decodeCborItem, mapGet } from "../../lib/encoding/cbor";
import { type Certificate, children, content, ecdsaDerToRaw, parseCertificate, readTlv } from "../../lib/encoding/der";
import { logEvent } from "../../lib/observability/log";
import { fail, ok, type Result } from "../shared/result";
import type { AttestEnvironment, AttestPolicy } from "./policy";

/**
 * Verifies a new key's attestation, following Apple's "Validating apps that connect to your
 * server" step by step (carodo-ios ADR 0009, docs/sync.md "App Attest"), plus the local-only
 * `carodo-debug` form. A refusal says only that the attestation is not valid; the reason is logged.
 */

export interface AttestedKey {
  /** Canonical key id: standard base64 of SHA-256 of the public key. */
  keyId: string;
  /** X9.62 uncompressed P-256 point (65 bytes). */
  publicKey: Bytes;
  environment: AttestEnvironment;
}

export interface AttestationInput {
  /** The key id's 32 bytes, as the app sent them. */
  keyId: Bytes;
  /** The challenge string, exactly as `/v1/auth/challenge` returned it. */
  challenge: string;
  attestation: Bytes;
}

const OID_NONCE = "1.2.840.113635.100.8.2";
const OID_P256 = "1.2.840.10045.3.1.7";
const OID_P384 = "1.3.132.0.34";
const OID_ECDSA_SHA256 = "1.2.840.10045.4.3.2";
const OID_ECDSA_SHA384 = "1.2.840.10045.4.3.3";

const AAGUID_DEVELOPMENT = utf8("appattestdevelop");
const AAGUID_PRODUCTION = concat(utf8("appattest"), new Uint8Array(7));

/** Validation categories an app of ours can carry: TestFlight, development-signed, App Store. */
const ACCEPTED_CATEGORIES = new Set([2, 3, 4]);

class Refusal extends Error {}

function refuse(reason: string): never {
  throw new Refusal(reason);
}

export async function verifyAttestation(
  policy: AttestPolicy,
  input: AttestationInput,
  now: number,
): Promise<Result<AttestedKey>> {
  try {
    let object: CborValue;
    try {
      object = decodeCbor(input.attestation);
    } catch {
      refuse("cbor");
    }
    const fmt = mapGet(object, "fmt");
    const clientDataHash = await sha256(utf8(input.challenge));
    if (fmt === "apple-appattest") return ok(await verifyApple(policy, input, object, clientDataHash, now));
    if (fmt === "carodo-debug" && policy.allowDebug) return ok(await verifyDebug(input, object, clientDataHash));
    // A category, never the value: the format is whatever the request sent (P5, C13).
    refuse("fmt");
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    logEvent("warn", "attest.attestation_refused", { reason: error.message });
    return fail("unauthorized", "The attestation is not valid.");
  }
}

async function verifyApple(
  policy: AttestPolicy,
  input: AttestationInput,
  object: CborValue,
  clientDataHash: Bytes,
  now: number,
): Promise<AttestedKey> {
  const statement = mapGet(object, "attStmt");
  const authData = bytesOf(mapGet(object, "authData"), "authData");
  const x5c = mapGet(statement, "x5c");
  if (!Array.isArray(x5c) || x5c.length < 2) refuse("x5c");

  // 1. The chain: credential certificate ← intermediate ← Apple's root, each valid now.
  const leaf = certificateAt(x5c[0], "leaf");
  const intermediate = certificateAt(x5c[1], "intermediate");
  const root = certificateAt(policy.root, "root");
  await verifyIssuedBy(intermediate, root, now, "intermediate");
  await verifyIssuedBy(leaf, intermediate, now, "leaf");
  if (now < root.notBefore || now > root.notAfter) refuse("root validity");

  // 2–4. The nonce in the credential certificate binds this attestation to our challenge.
  const nonce = await sha256(concat(authData, clientDataHash));
  const extension = leaf.extensions.get(OID_NONCE);
  if (!extension || !bytesEqual(octetStringIn(extension), nonce)) refuse("nonce");

  // 5. The key id is the hash of the attested public key.
  if (leaf.curve !== OID_P256 || leaf.publicKey.length !== 65 || leaf.publicKey[0] !== 0x04) refuse("key type");
  const keyHash = await sha256(leaf.publicKey);
  if (!bytesEqual(keyHash, input.keyId)) refuse("key id");

  // 6–11. The authenticator data.
  const data = parseAuthenticatorData(authData, true);
  if (!bytesEqual(data.rpIdHash, await sha256(utf8(policy.appId)))) refuse("app id");
  if (data.counter !== 0) refuse("counter");
  const environment = bytesEqual(data.aaguid, AAGUID_DEVELOPMENT)
    ? "development"
    : bytesEqual(data.aaguid, AAGUID_PRODUCTION)
      ? "production"
      : refuse("aaguid");
  if (!policy.environments.has(environment)) refuse(`environment ${environment}`);
  if (!bytesEqual(data.credentialId, input.keyId)) refuse("credential id");
  const category = validationCategory(mapGet(data.extensions, "apple_validation_category_01"));
  if (category !== undefined && !ACCEPTED_CATEGORIES.has(category)) refuse("validation category");

  return { keyId: toBase64(keyHash), publicKey: leaf.publicKey, environment };
}

/**
 * `apple_validation_category_01`, which iOS 27 writes in the authenticator data's extensions: a
 * 4-byte string holding a little-endian unsigned integer (a development-signed build sends
 * `03 00 00 00`). Undefined when absent (older iOS); anything else refuses.
 */
function validationCategory(value: CborValue | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!(value instanceof Uint8Array) || value.length !== 4) return refuse("validation category");
  return new DataView(value.buffer, value.byteOffset, 4).getUint32(0, true);
}

/** `carodo-debug`: a software P-256 key that signs `clientDataHash` (docs/sync.md "Development"). */
async function verifyDebug(input: AttestationInput, object: CborValue, clientDataHash: Bytes): Promise<AttestedKey> {
  const publicKey = bytesOf(mapGet(object, "publicKey"), "publicKey");
  const signature = bytesOf(mapGet(object, "signature"), "signature");
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) refuse("key type");
  const keyHash = await sha256(publicKey);
  if (!bytesEqual(keyHash, input.keyId)) refuse("key id");
  if (!(await verifyP256(publicKey, signature, clientDataHash))) refuse("signature");
  return { keyId: toBase64(keyHash), publicKey, environment: "development" };
}

/** An ECDSA P-256 / SHA-256 signature (DER) by an X9.62 public key, over `message`. */
export async function verifyP256(publicKey: Bytes, signature: Bytes, message: Bytes): Promise<boolean> {
  let raw: Bytes;
  let key: CryptoKey;
  try {
    raw = ecdsaDerToRaw(signature, 32);
    key = await crypto.subtle.importKey("raw", publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  } catch {
    return false;
  }
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, raw, message);
}

function certificateAt(der: CborValue | undefined, what: string): Certificate {
  const bytes = bytesOf(der, `${what} certificate`);
  try {
    return parseCertificate(bytes);
  } catch {
    return refuse(`${what} certificate`);
  }
}

async function verifyIssuedBy(child: Certificate, issuer: Certificate, now: number, what: string): Promise<void> {
  if (!bytesEqual(child.issuer, issuer.subject)) refuse(`${what} issuer`);
  if (now < child.notBefore || now > child.notAfter) refuse(`${what} validity`);
  const hash =
    child.signatureAlgorithm === OID_ECDSA_SHA256
      ? "SHA-256"
      : child.signatureAlgorithm === OID_ECDSA_SHA384
        ? "SHA-384"
        : refuse(`${what} signature algorithm`);
  const [namedCurve, size] =
    issuer.curve === OID_P384 ? ["P-384", 48] : issuer.curve === OID_P256 ? ["P-256", 32] : refuse(`${what} curve`);
  let valid = false;
  try {
    const key = await crypto.subtle.importKey("spki", issuer.spki, { name: "ECDSA", namedCurve }, false, ["verify"]);
    valid = await crypto.subtle.verify({ name: "ECDSA", hash }, key, ecdsaDerToRaw(child.signature, size), child.tbs);
  } catch {
    refuse(`${what} signature`);
  }
  if (!valid) refuse(`${what} signature`);
}

/** The single OCTET STRING inside the nonce extension (`SEQUENCE { [1] { OCTET STRING } }`). */
function octetStringIn(der: Bytes): Bytes {
  try {
    let tlv = readTlv(der, 0);
    while (tlv.tag & 0x20) {
      const [first] = children(der, tlv);
      if (!first) refuse("nonce extension");
      tlv = first;
    }
    if (tlv.tag !== 0x04) refuse("nonce extension");
    return content(der, tlv);
  } catch (error) {
    if (error instanceof Refusal) throw error;
    refuse("nonce extension");
  }
}

export interface AuthenticatorData {
  rpIdHash: Bytes;
  flags: number;
  counter: number;
  aaguid: Bytes;
  credentialId: Bytes;
  extensions: CborValue | undefined;
}

/**
 * WebAuthn authenticator data: rpIdHash (32) · flags (1) · counter (4, big-endian), then for an
 * attestation aaguid (16) · credential id length (2) · credential id · COSE key, and extensions
 * when the ED flag is set. An assertion stops after the counter (or carries extensions).
 */
export function parseAuthenticatorData(data: Bytes, attested: boolean): AuthenticatorData {
  if (data.length < 37) refuse("authenticator data length");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const flags = data[32] as number;
  const result: AuthenticatorData = {
    rpIdHash: data.slice(0, 32),
    flags,
    counter: view.getUint32(33),
    aaguid: new Uint8Array(0),
    credentialId: new Uint8Array(0),
    extensions: undefined,
  };
  let cursor = 37;
  try {
    if (attested) {
      if (!(flags & 0x40) || data.length < 55) refuse("attested credential data");
      result.aaguid = data.slice(37, 53);
      const length = view.getUint16(53);
      result.credentialId = data.slice(55, 55 + length);
      if (result.credentialId.length !== length) refuse("credential id length");
      cursor = decodeCborItem(data, 55 + length).end; // the COSE key; the certificate carries the key we use
    }
    if (flags & 0x80) {
      const extensions = decodeCborItem(data, cursor);
      result.extensions = extensions.value;
      cursor = extensions.end;
    }
  } catch (error) {
    if (error instanceof Refusal) throw error;
    refuse("authenticator data");
  }
  if (cursor !== data.length) refuse("authenticator data trailing bytes");
  return result;
}

function bytesOf(value: CborValue | undefined, what: string): Bytes {
  if (!(value instanceof Uint8Array)) refuse(what);
  return value;
}

export { Refusal };
