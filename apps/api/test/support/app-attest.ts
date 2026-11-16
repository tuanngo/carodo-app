import {
  bitString,
  cbor,
  explicit,
  integer,
  join,
  name,
  octetString,
  oid,
  rawToDer,
  sequence,
  toBase64,
  utcTime,
} from "./encode.ts";

/**
 * A stand-in for Apple: a root and an intermediate of our own that issue App Attest credential
 * certificates exactly as Apple lays them out, so every verification step runs in a test. And the
 * app's side: debug attestations and assertions, as carodo-ios docs/sync.md describes them.
 */

type Bytes = Uint8Array<ArrayBuffer>;

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const P384 = { name: "ECDSA", namedCurve: "P-384" } as const;
const ECDSA_SHA256 = "1.2.840.10045.4.3.2";
const ECDSA_SHA384 = "1.2.840.10045.4.3.3";
const DAY = 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

export async function sha256(data: Uint8Array): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data as Bytes));
}

export async function generateP256(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(P256, true, ["sign", "verify"]) as Promise<CryptoKeyPair>;
}

export async function rawPublicKey(key: CryptoKey): Promise<Bytes> {
  return new Uint8Array((await crypto.subtle.exportKey("raw", key)) as ArrayBuffer);
}

/** ECDSA with SHA-256 over `message`, DER: what CryptoKit's `signature(for:)` returns. */
export async function signP256(privateKey: CryptoKey, message: Uint8Array): Promise<Bytes> {
  const raw = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, message as Bytes);
  return rawToDer(new Uint8Array(raw));
}

interface Issuer {
  name: string;
  keys: CryptoKeyPair;
  hash: "SHA-256" | "SHA-384";
}

let serial = 1;

async function certificate(options: {
  issuer: Issuer;
  subject: string;
  publicKey: CryptoKey;
  notBefore: number;
  notAfter: number;
  extensions?: Uint8Array[];
}): Promise<Bytes> {
  const algorithm = sequence(oid(options.issuer.hash === "SHA-384" ? ECDSA_SHA384 : ECDSA_SHA256));
  const spki = new Uint8Array((await crypto.subtle.exportKey("spki", options.publicKey)) as ArrayBuffer);
  const tbs = sequence(
    explicit(0, integer(Uint8Array.of(2))),
    integer(Uint8Array.of(serial++)),
    algorithm,
    name(options.issuer.name),
    sequence(utcTime(options.notBefore), utcTime(options.notAfter)),
    name(options.subject),
    spki,
    ...(options.extensions ? [explicit(3, sequence(...options.extensions))] : []),
  );
  const raw = await crypto.subtle.sign(
    { name: "ECDSA", hash: options.issuer.hash },
    options.issuer.keys.privateKey,
    tbs as Bytes,
  );
  return sequence(tbs, algorithm, bitString(rawToDer(new Uint8Array(raw)))) as Bytes;
}

export interface FakeApple {
  root: Bytes;
  intermediate: Issuer & { certificate: Bytes };
}

/** A root (P-384) and an intermediate (P-384) valid a year either side of `now`. */
export async function fakeApple(now: number): Promise<FakeApple> {
  const rootKeys = (await crypto.subtle.generateKey(P384, true, ["sign", "verify"])) as CryptoKeyPair;
  const root: Issuer = { name: "Test App Attestation Root CA", keys: rootKeys, hash: "SHA-384" };
  const rootCertificate = await certificate({
    issuer: root,
    subject: root.name,
    publicKey: rootKeys.publicKey,
    notBefore: now - 365 * DAY,
    notAfter: now + 365 * DAY,
  });
  const intermediateKeys = (await crypto.subtle.generateKey(P384, true, ["sign", "verify"])) as CryptoKeyPair;
  const intermediate: Issuer = { name: "Test App Attestation CA 1", keys: intermediateKeys, hash: "SHA-256" };
  const intermediateCertificate = await certificate({
    issuer: root,
    subject: intermediate.name,
    publicKey: intermediateKeys.publicKey,
    notBefore: now - 365 * DAY,
    notAfter: now + 365 * DAY,
  });
  return { root: rootCertificate, intermediate: { ...intermediate, certificate: intermediateCertificate } };
}

export const AAGUID = {
  development: encoder.encode("appattestdevelop"),
  production: join(encoder.encode("appattest"), new Uint8Array(7)),
};

export interface AttestationOptions {
  apple: FakeApple;
  appId: string;
  challenge: string;
  now: number;
  environment?: "development" | "production";
  /** Overrides, each breaking one step. */
  counter?: number;
  aaguid?: Uint8Array;
  nonce?: Uint8Array;
  credentialId?: Uint8Array;
  leafNotAfter?: number;
  extensions?: Map<string, number | string>;
}

/** An `apple-appattest` attestation of a fresh P-256 key, laid out as Apple's. */
export async function appleAttestation(options: AttestationOptions) {
  const keys = await generateP256();
  const publicKey = await rawPublicKey(keys.publicKey);
  const keyId = await sha256(publicKey);
  const coseKey = cbor(
    new Map<number, Uint8Array | number>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, publicKey.slice(1, 33)],
      [-3, publicKey.slice(33)],
    ]),
  );
  const credentialId = options.credentialId ?? keyId;
  const counter = new Uint8Array(4);
  new DataView(counter.buffer).setUint32(0, options.counter ?? 0);
  const authData = join(
    await sha256(encoder.encode(options.appId)),
    Uint8Array.of(options.extensions ? 0xc0 : 0x40),
    counter,
    options.aaguid ?? AAGUID[options.environment ?? "development"],
    Uint8Array.of(credentialId.length >> 8, credentialId.length & 0xff),
    credentialId,
    coseKey,
    ...(options.extensions ? [cbor(options.extensions)] : []),
  );
  const nonce = options.nonce ?? (await sha256(join(authData, await sha256(encoder.encode(options.challenge)))));
  const leaf = await certificate({
    issuer: options.apple.intermediate,
    subject: "credential",
    publicKey: keys.publicKey,
    notBefore: options.now - DAY,
    notAfter: options.leafNotAfter ?? options.now + DAY,
    extensions: [sequence(oid("1.2.840.113635.100.8.2"), octetString(sequence(explicit(1, octetString(nonce)))))],
  });
  const attestation = cbor(
    new Map<string, Uint8Array | string | Map<string, Uint8Array[] | Uint8Array>>([
      ["fmt", "apple-appattest"],
      [
        "attStmt",
        new Map<string, Uint8Array[] | Uint8Array>([
          ["x5c", [leaf, options.apple.intermediate.certificate]],
          ["receipt", new Uint8Array(8)],
        ]),
      ],
      ["authData", authData],
    ]),
  );
  return { keys, publicKey, keyId, attestation: attestation as Bytes };
}

/** A `carodo-debug` attestation (docs/sync.md "Development"). */
export async function debugAttestation(keys: CryptoKeyPair, challenge: string) {
  const publicKey = await rawPublicKey(keys.publicKey);
  const signature = await signP256(keys.privateKey, await sha256(encoder.encode(challenge)));
  const attestation = cbor(
    new Map<string, string | Uint8Array>([
      ["fmt", "carodo-debug"],
      ["publicKey", publicKey],
      ["signature", signature],
    ]),
  );
  return { publicKey, keyId: await sha256(publicKey), attestation: attestation as Bytes };
}

/** The bytes an assertion signs for a request. */
export async function clientData(method: string, pathAndQuery: string, body: Uint8Array = new Uint8Array(0)) {
  return encoder.encode(`${method}\n${pathAndQuery}\n${toBase64(await sha256(body))}`) as Bytes;
}

/** An App Attest assertion: authenticatorData (rpIdHash · flags · counter) and its signature. */
export async function assertion(privateKey: CryptoKey, appId: string, counter: number, data: Uint8Array) {
  const counterBytes = new Uint8Array(4);
  new DataView(counterBytes.buffer).setUint32(0, counter);
  const authenticatorData = join(await sha256(encoder.encode(appId)), Uint8Array.of(0), counterBytes);
  const nonce = await sha256(join(authenticatorData, await sha256(data)));
  const signature = await signP256(privateKey, nonce);
  const fields = new Map<string, Uint8Array>();
  fields.set("signature", signature);
  fields.set("authenticatorData", authenticatorData);
  const encoded = cbor(fields);
  return { authenticatorData, nonce, assertion: encoded as Bytes };
}
