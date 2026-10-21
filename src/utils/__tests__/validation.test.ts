import { describe, it, expect } from "vitest";
import {
  emailSchema,
  passwordSchema,
  nameSchema,
  stellarAddressSchema,
  tokenAmountSchema,
  createContactSchema,
} from "../validation";

// #141 — table-driven tests for validation schemas.

describe("emailSchema", () => {
  const valid = ["user@example.com", "a.b@c.d.com", "x@y.io"];
  const invalid = ["", "no-at-sign", "no-domain@", "@no-local.com", "two@@at.com"];
  for (const e of valid) {
    it(`accepts "${e}"`, () => {
      expect(emailSchema.safeParse(e).success).toBe(true);
    });
  }
  for (const e of invalid) {
    it(`rejects "${e}"`, () => {
      const r = emailSchema.safeParse(e);
      expect(r.success).toBe(false);
    });
  }
  it("reports 'Email is required' on empty", () => {
    expect(emailSchema.safeParse("").error?.issues[0]?.message).toBe("Email is required");
  });
});

describe("passwordSchema", () => {
  const valid = ["Abcdefg1", "Password1", "UPPERlower9"];
  const invalid = ["", "short", "alllowercase1", "ALLUPPER1", "NoDigitsHere"];
  for (const p of valid) {
    it(`accepts "${p}"`, () => {
      expect(passwordSchema.safeParse(p).success).toBe(true);
    });
  }
  for (const p of invalid) {
    it(`rejects "${p}"`, () => {
      expect(passwordSchema.safeParse(p).success).toBe(false);
    });
  }
  it("requires at least 8 chars", () => {
    const r = passwordSchema.safeParse("Ab1");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain("at least 8");
  });
  it("requires uppercase + lowercase + digit", () => {
    const r = passwordSchema.safeParse("alllowercase");
    expect(r.success).toBe(false);
  });
});

describe("nameSchema", () => {
  it("rejects empty", () => {
    expect(nameSchema.safeParse("").success).toBe(false);
  });
  it("rejects single char", () => {
    expect(nameSchema.safeParse("A").success).toBe(false);
  });
  it("accepts 'Alice'", () => {
    expect(nameSchema.safeParse("Alice").success).toBe(true);
  });
  it("rejects > 50 chars", () => {
    expect(nameSchema.safeParse("A".repeat(51)).success).toBe(false);
  });
});

describe("stellarAddressSchema", () => {
  const validAddr = "GABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789AB";
  it("accepts a valid G... 56-char address", () => {
    expect(stellarAddressSchema.safeParse(validAddr).success).toBe(true);
  });
  it("rejects empty", () => {
    expect(stellarAddressSchema.safeParse("").success).toBe(false);
  });
  it("rejects lowercase g prefix", () => {
    expect(stellarAddressSchema.safeParse("g" + validAddr.slice(1)).success).toBe(false);
  });
  it("rejects too-short string", () => {
    expect(stellarAddressSchema.safeParse("GABC").success).toBe(false);
  });
  it("rejects address with special chars", () => {
    expect(stellarAddressSchema.safeParse("G" + "!" + "A".repeat(54)).success).toBe(false);
  });
});

describe("tokenAmountSchema", () => {
  it("accepts positive decimal", () => {
    expect(tokenAmountSchema.safeParse("1.5").success).toBe(true);
  });
  it("accepts integer", () => {
    expect(tokenAmountSchema.safeParse("100").success).toBe(true);
  });
  it("rejects empty", () => {
    expect(tokenAmountSchema.safeParse("").success).toBe(false);
  });
  it("rejects zero", () => {
    expect(tokenAmountSchema.safeParse("0").success).toBe(false);
  });
  it("rejects negative", () => {
    expect(tokenAmountSchema.safeParse("-1").success).toBe(false);
  });
  it("rejects non-numeric", () => {
    expect(tokenAmountSchema.safeParse("abc").success).toBe(false);
  });
});

describe("createContactSchema", () => {
  const valid = {
    name: "Alice",
    address: "GABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789AB",
    tokenType: "XLM" as const,
  };
  it("accepts a valid contact", () => {
    expect(createContactSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects missing name", () => {
    const r = createContactSchema.safeParse({ ...valid, name: "" });
    expect(r.success).toBe(false);
  });
  it("rejects invalid tokenType", () => {
    const r = createContactSchema.safeParse({ ...valid, tokenType: "DOGE" });
    expect(r.success).toBe(false);
  });
  it("rejects invalid address", () => {
    const r = createContactSchema.safeParse({ ...valid, address: "bad" });
    expect(r.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sendPaymentSchema
// ─────────────────────────────────────────────────────────────────────────────
import { sendPaymentSchema, createContactSchema } from '../validation';
import { SUPPORTED_ASSETS } from '@/types';

const VALID_ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV';

// Helper: build a 56-char valid G-address
const G56 = 'G' + 'A'.repeat(55);

describe('sendPaymentSchema', () => {
  const base = {
    recipientAddress: G56,
    amount: '10',
    tokenType: 'XLM',
    memoType: 'none',
  };

  it('accepts a minimal valid payload', () => {
    expect(sendPaymentSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an empty recipient address', () => {
    const r = sendPaymentSchema.safeParse({ ...base, recipientAddress: '' });
    expect(r.success).toBe(false);
  });

  it('rejects amount of 0', () => {
    const r = sendPaymentSchema.safeParse({ ...base, amount: '0' });
    expect(r.success).toBe(false);
  });

  it('rejects a negative amount', () => {
    const r = sendPaymentSchema.safeParse({ ...base, amount: '-1' });
    expect(r.success).toBe(false);
  });

  it('rejects amount above max', () => {
    const r = sendPaymentSchema.safeParse({ ...base, amount: '9999999' });
    expect(r.success).toBe(false);
  });

  it.each(SUPPORTED_ASSETS)('accepts tokenType %s', (token) => {
    const r = sendPaymentSchema.safeParse({ ...base, tokenType: token });
    expect(r.success).toBe(true);
  });

  it('rejects an unsupported tokenType (STRK)', () => {
    const r = sendPaymentSchema.safeParse({ ...base, tokenType: 'STRK' });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('Unsupported token type');
  });

  it('rejects an unsupported tokenType (DAI)', () => {
    const r = sendPaymentSchema.safeParse({ ...base, tokenType: 'DAI' });
    expect(r.success).toBe(false);
  });

  it('rejects memo without memoType when memo is provided', () => {
    const r = sendPaymentSchema.safeParse({
      ...base,
      memo: 'hello',
      memoType: undefined,
    });
    expect(r.success).toBe(false);
  });

  it('accepts memo with memoType=text', () => {
    const r = sendPaymentSchema.safeParse({
      ...base,
      memo: 'hello',
      memoType: 'text',
    });
    expect(r.success).toBe(true);
  });

  it('rejects id memo with non-numeric content', () => {
    const r = sendPaymentSchema.safeParse({
      ...base,
      memo: 'abc',
      memoType: 'id',
    });
    expect(r.success).toBe(false);
  });

  it('accepts id memo with numeric content', () => {
    const r = sendPaymentSchema.safeParse({
      ...base,
      memo: '12345',
      memoType: 'id',
    });
    expect(r.success).toBe(true);
  });

  it('rejects hash memo shorter than 64 hex chars', () => {
    const r = sendPaymentSchema.safeParse({
      ...base,
      memo: 'abc',
      memoType: 'hash',
    });
    expect(r.success).toBe(false);
  });

  it('accepts a 64-char hex hash memo', () => {
    const r = sendPaymentSchema.safeParse({
      ...base,
      memo: 'a'.repeat(64),
      memoType: 'hash',
    });
    expect(r.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createContactSchema — unified asset list
// ─────────────────────────────────────────────────────────────────────────────
describe('createContactSchema — unified asset list', () => {
  const base = { name: 'Alice', address: G56 };

  it.each(SUPPORTED_ASSETS)('accepts supported tokenType %s', (token) => {
    expect(createContactSchema.safeParse({ ...base, tokenType: token }).success).toBe(true);
  });

  it('rejects legacy tokenType STRK with actionable message', () => {
    const r = createContactSchema.safeParse({ ...base, tokenType: 'STRK' });
    expect(r.success).toBe(false);
    // Error message must list the supported tokens so the user knows what to use
    const messages = r.error?.issues.map((i) => i.message).join(' ');
    expect(messages).toContain('Unsupported token type');
  });

  it('rejects legacy tokenType DAI', () => {
    const r = createContactSchema.safeParse({ ...base, tokenType: 'DAI' });
    expect(r.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORTED_ASSETS integrity
// ─────────────────────────────────────────────────────────────────────────────
describe('SUPPORTED_ASSETS', () => {
  it('includes at least one entry', () => {
    expect(SUPPORTED_ASSETS.length).toBeGreaterThan(0);
  });

  it('contains the expected tokens', () => {
    expect(SUPPORTED_ASSETS).toContain('XLM');
    expect(SUPPORTED_ASSETS).toContain('USDC');
    expect(SUPPORTED_ASSETS).toContain('USDT');
    expect(SUPPORTED_ASSETS).toContain('BTC');
    expect(SUPPORTED_ASSETS).toContain('ETH');
    expect(SUPPORTED_ASSETS).toContain('AQUA');
  });

  it('does not contain unsupported legacy tokens', () => {
    expect(SUPPORTED_ASSETS).not.toContain('STRK');
    expect(SUPPORTED_ASSETS).not.toContain('DAI');
  });
});
