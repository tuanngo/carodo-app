import type { Bytes } from "./bytes";

/**
 * A DER reader (X.690) and an X.509 certificate parser for exactly what App Attest needs: the
 * signed bytes, the signature, the subject public key, names, validity and extensions. It checks
 * no policy of its own; `services/attest` decides what a certificate must say.
 */

export class DerError extends Error {}

export interface Tlv {
  tag: number;
  /** Offset of the tag byte: `bytes.slice(start, end)` is the whole encoded element. */
  start: number;
  /** Offset of the first content byte. */
  contentStart: number;
  end: number;
}

export function readTlv(bytes: Bytes, offset: number): Tlv {
  const tag = bytes[offset];
  if (tag === undefined) throw new DerError("truncated");
  if ((tag & 0x1f) === 0x1f) throw new DerError("high tag numbers are not used here");
  const first = bytes[offset + 1];
  if (first === undefined) throw new DerError("truncated length");
  let length = first;
  let contentStart = offset + 2;
  if (first & 0x80) {
    const width = first & 0x7f;
    if (width === 0 || width > 4) throw new DerError("unsupported length");
    length = 0;
    for (let i = 0; i < width; i++) {
      const byte = bytes[offset + 2 + i];
      if (byte === undefined) throw new DerError("truncated length");
      length = length * 256 + byte;
    }
    contentStart += width;
  }
  const end = contentStart + length;
  if (end > bytes.length) throw new DerError("element longer than its input");
  return { tag, start: offset, contentStart, end };
}

/** The elements directly inside a constructed element. */
export function children(bytes: Bytes, parent: Tlv): Tlv[] {
  const items: Tlv[] = [];
  let cursor = parent.contentStart;
  while (cursor < parent.end) {
    const item = readTlv(bytes, cursor);
    if (item.end > parent.end) throw new DerError("child overruns its parent");
    items.push(item);
    cursor = item.end;
  }
  return items;
}

export function content(bytes: Bytes, tlv: Tlv): Bytes {
  return bytes.slice(tlv.contentStart, tlv.end);
}

function expect(tlv: Tlv | undefined, tag: number, what: string): Tlv {
  if (!tlv || tlv.tag !== tag) throw new DerError(`expected ${what}`);
  return tlv;
}

const SEQUENCE = 0x30;
const OID = 0x06;
const BIT_STRING = 0x03;
const OCTET_STRING = 0x04;
const BOOLEAN = 0x01;
const UTC_TIME = 0x17;
const GENERALIZED_TIME = 0x18;

/** Dotted form of an OBJECT IDENTIFIER's content. */
export function oidToString(value: Uint8Array): string {
  const first = value[0];
  if (first === undefined) throw new DerError("empty OID");
  const parts = [Math.floor(first / 40), first % 40];
  let current = 0;
  for (let i = 1; i < value.length; i++) {
    const byte = value[i] as number;
    current = current * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) {
      parts.push(current);
      current = 0;
    }
  }
  return parts.join(".");
}

export interface Certificate {
  /** The DER of tbsCertificate: what the issuer signed. */
  tbs: Bytes;
  signatureAlgorithm: string;
  /** DER ECDSA-Sig-Value, as the BIT STRING carries it. */
  signature: Bytes;
  issuer: Bytes;
  subject: Bytes;
  notBefore: number;
  notAfter: number;
  /** The DER SubjectPublicKeyInfo, ready for `crypto.subtle.importKey("spki", …)`. */
  spki: Bytes;
  /** The named curve's OID from the key's parameters. */
  curve: string;
  /** The key's BIT STRING without its unused-bits byte (an X9.62 point for EC). */
  publicKey: Bytes;
  /** Extension OID to its extnValue content (the bytes inside the OCTET STRING). */
  extensions: Map<string, Bytes>;
}

export function parseCertificate(der: Bytes): Certificate {
  const certificate = expect(readTlv(der, 0), SEQUENCE, "Certificate");
  if (certificate.end !== der.length) throw new DerError("trailing bytes");
  const [tbsTlv, algorithmTlv, signatureTlv] = children(der, certificate);
  const tbs = expect(tbsTlv, SEQUENCE, "tbsCertificate");
  const signatureAlgorithm = algorithmOf(der, expect(algorithmTlv, SEQUENCE, "signatureAlgorithm"));
  const signature = bitString(der, expect(signatureTlv, BIT_STRING, "signature"));

  const fields = children(der, tbs);
  // [0] EXPLICIT version is optional; serialNumber follows.
  let index = fields[0]?.tag === 0xa0 ? 1 : 0;
  index += 1; // serialNumber
  index += 1; // signature (algorithm, repeated)
  const issuer = expect(fields[index++], SEQUENCE, "issuer");
  const validity = expect(fields[index++], SEQUENCE, "validity");
  const subject = expect(fields[index++], SEQUENCE, "subject");
  const spkiTlv = expect(fields[index++], SEQUENCE, "subjectPublicKeyInfo");

  const [notBeforeTlv, notAfterTlv] = children(der, validity);
  const [keyAlgorithmTlv, keyTlv] = children(der, spkiTlv);
  const keyAlgorithm = children(der, expect(keyAlgorithmTlv, SEQUENCE, "key algorithm"));
  const curveTlv = expect(keyAlgorithm[1], OID, "named curve");

  const extensions = new Map<string, Bytes>();
  for (const field of fields.slice(index)) {
    if (field.tag !== 0xa3) continue; // [3] EXPLICIT extensions; [1] and [2] unique ids are skipped
    const list = expect(children(der, field)[0], SEQUENCE, "extensions");
    for (const extension of children(der, list)) {
      const parts = children(der, expect(extension, SEQUENCE, "extension"));
      const id = oidToString(content(der, expect(parts[0], OID, "extnID")));
      const valueTlv = parts[1]?.tag === BOOLEAN ? parts[2] : parts[1];
      if (extensions.has(id)) throw new DerError("duplicate extension");
      extensions.set(id, content(der, expect(valueTlv, OCTET_STRING, "extnValue")));
    }
  }

  return {
    tbs: der.slice(tbs.start, tbs.end),
    signatureAlgorithm,
    signature,
    issuer: der.slice(issuer.start, issuer.end),
    subject: der.slice(subject.start, subject.end),
    notBefore: time(der, notBeforeTlv),
    notAfter: time(der, notAfterTlv),
    spki: der.slice(spkiTlv.start, spkiTlv.end),
    curve: oidToString(content(der, curveTlv)),
    publicKey: bitString(der, expect(keyTlv, BIT_STRING, "subjectPublicKey")),
    extensions,
  };
}

function algorithmOf(der: Bytes, algorithm: Tlv): string {
  return oidToString(content(der, expect(children(der, algorithm)[0], OID, "algorithm")));
}

function bitString(der: Bytes, tlv: Tlv): Bytes {
  if (der[tlv.contentStart] !== 0) throw new DerError("bit string with unused bits");
  return der.slice(tlv.contentStart + 1, tlv.end);
}

/** UTCTime (YYMMDDHHMMSSZ) or GeneralizedTime (YYYYMMDDHHMMSSZ), as Unix milliseconds. */
function time(der: Bytes, tlv: Tlv | undefined): number {
  if (!tlv || (tlv.tag !== UTC_TIME && tlv.tag !== GENERALIZED_TIME)) throw new DerError("expected a time");
  const text = new TextDecoder().decode(content(der, tlv));
  const match =
    tlv.tag === UTC_TIME
      ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(text)
      : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(text);
  if (!match) throw new DerError("unsupported time");
  const [, y, mo, d, h, mi, s] = match.map(Number) as number[];
  const year = tlv.tag === UTC_TIME ? ((y as number) >= 50 ? 1900 : 2000) + (y as number) : (y as number);
  return Date.UTC(year, (mo as number) - 1, d, h, mi, s);
}

/** An ECDSA-Sig-Value (SEQUENCE of r and s) as the fixed-width r ‖ s WebCrypto verifies. */
export function ecdsaDerToRaw(signature: Bytes, size: number): Bytes {
  const sequence = expect(readTlv(signature, 0), SEQUENCE, "ECDSA-Sig-Value");
  if (sequence.end !== signature.length) throw new DerError("trailing bytes");
  const [r, s] = children(signature, sequence);
  const raw = new Uint8Array(size * 2);
  for (const [i, part] of [r, s].entries()) {
    let value = content(signature, expect(part, 0x02, "INTEGER"));
    while (value.length > 1 && value[0] === 0) value = value.slice(1);
    if (value.length > size) throw new DerError("integer wider than the curve");
    raw.set(value, i * size + size - value.length);
  }
  return raw;
}
