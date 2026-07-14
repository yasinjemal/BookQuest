# Phase 4 signed Open Badge issuance

**Proof format:** Open Badges 3.0 VC-JWT / Compact JWS  
**Algorithm:** RS256  
**Engineering status:** Deployed

**External validation status:** Pending user acquisition

**External validation reason:** `Pending user acquisition and partner access`
**Certification:** no 1EdTech certification is claimed

## Standards profile

BookQuest follows the Open Badges 3.0 VC-JWT rules in the official 1EdTech
specification: <https://www.imsglobal.org/spec/ob/v3p0/#json-web-token-proof-format>.
The JOSE header contains only `alg`, `kid` and `typ`; `alg` is RS256, the minimum
interoperable algorithm named by the specification, and `kid` dereferences to a
public-only JWK. The payload duplicates `iss`, `sub`, `nbf`, `jti` and optional
`exp` and carries the profile-validated OpenBadgeCredential in `vc`.

The downloaded file is the Compact JWS itself with a `.jwt` extension and
`text/plain` representation, matching the specification's portable file format.

## Key and lifecycle contract

- Each issuing Space has one active 2048-bit RSA key. Its PKCS#8 private key is
  AES-256-GCM encrypted using dedicated Open Badges key material, with the
  existing MFA/generation secret allowed as an operational fallback.
- Public JWKs never include private RSA parameters. Key rows are immutable except
  for a one-way active-to-retired transition.
- Only an exact-Space member with `assignments.manage` may rotate a key. Retired
  public keys remain dereferenceable so previously issued credentials continue
  to verify; new credentials use the replacement key.
- A learner may issue only their own latest eligible claim and may revoke only
  their own signed credential. Issuance is idempotent per immutable claim version.
- Verification checks the RS256 signature, strict JOSE header, duplicated JWT
  claims, selected document profile, stored issued credential, current claim,
  completion decision, account lifecycle and underlying credential status.
- Status uses a 256-bit opaque value stored only as a digest. Unknown status IDs
  return a uniform not-found response. Known credentials report active or
  revoked/expired without exposing the learner.
- Verification holds shared lifecycle locks; revocation holds an exclusive lock,
  preventing a successful verification after a committed revocation.
- Effective account erasure revokes active signed credentials. The pseudonymous
  signed credential and lifecycle history remain in the learner export without
  issuer private-key material.

## Product boundary

The signed credential intentionally contains no learner name, email or internal
numeric account ID. Possession and subject binding for third-party wallets need a
future wallet/OAuth exchange; BookQuest does not publish a learner directory.
Issuer certification and conformance-suite results remain separate external
evidence gates.
