import { describe, expect, it } from "vitest";
import { extractReadableWebText, isBlockedSourceAddress } from "../lib/web-source";

describe("secure webpage source import", () => {
  it("blocks local, private, link-local and documentation addresses", () => {
    for (const address of [
      "127.0.0.1", "10.0.0.1", "172.16.1.1", "192.168.1.1",
      "169.254.169.254", "100.64.0.1", "192.0.2.1", "::1", "fd00::1", "fe80::1",
    ]) {
      expect(isBlockedSourceAddress(address), address).toBe(true);
    }
    expect(isBlockedSourceAddress("1.1.1.1")).toBe(false);
    expect(isBlockedSourceAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("extracts readable text while removing active and decorative markup", () => {
    const result = extractReadableWebText(`
      <html><head><title>Trusted &amp; useful</title><style>.x{}</style></head>
      <body><h1>Heading</h1><p>Important text.</p><script>alert('no')</script>
      <p>Second paragraph &lt;safe&gt;.</p></body></html>
    `);
    expect(result.title).toBe("Trusted & useful");
    expect(result.text).toContain("Heading");
    expect(result.text).toContain("Second paragraph <safe>.");
    expect(result.text).not.toContain("alert");
  });
});
