import { describe, it, expect } from "vitest";
import {
  emailSchema,
  passwordSchema,
  nameSchema,
  stellarAddressSchema,
  tokenAmountSchema,
  createContactSchema,
  sendPaymentSchema,
  validateSendPayment,
  validateMemo,
  sanitizePaymentInput,
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

describe("#344 — sendPaymentSchema and Memo Validation", () => {
  const validStellarAddress = "GABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789AB";
  const validBasePayment = {
    recipientAddress: validStellarAddress,
    amount: "10.5",
    tokenType: "XLM" as const,
  };

  describe("Base payment fields", () => {
    it("accepts valid payment without memo", () => {
      expect(sendPaymentSchema.safeParse(validBasePayment).success).toBe(true);
    });

    it("accepts valid payment with recipientContactId", () => {
      const data = { ...validBasePayment, recipientContactId: "contact-123" };
      expect(sendPaymentSchema.safeParse(data).success).toBe(true);
    });

    it("accepts all supported token types", () => {
      const tokens = ["XLM", "USDC", "USDT", "BTC", "ETH", "AQUA"] as const;
      for (const token of tokens) {
        expect(sendPaymentSchema.safeParse({ ...validBasePayment, tokenType: token }).success).toBe(true);
      }
    });

    it("rejects unsupported token types", () => {
      const invalidTokens = ["DOGE", "SOL", "ADA", ""];
      for (const token of invalidTokens) {
        const res = sendPaymentSchema.safeParse({ ...validBasePayment, tokenType: token as any });
        expect(res.success).toBe(false);
      }
    });

    it("rejects invalid recipient addresses", () => {
      const invalidAddresses = [
        "",
        "0x1234567890abcdef",
        "g" + validStellarAddress.slice(1),
        "GSHORT",
        "G" + "!".repeat(55),
      ];
      for (const addr of invalidAddresses) {
        expect(sendPaymentSchema.safeParse({ ...validBasePayment, recipientAddress: addr }).success).toBe(false);
      }
    });

    it("validates payment amount boundaries and precision", () => {
      // Valid amounts
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "0.0000001" }).success).toBe(true);
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "1000000" }).success).toBe(true);
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "50.1234567" }).success).toBe(true);

      // Malformed or out-of-range amounts
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "" }).success).toBe(false);
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "0" }).success).toBe(false);
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "-5" }).success).toBe(false);
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "0.00000001" }).success).toBe(false);
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "1000001" }).success).toBe(false);
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "abc" }).success).toBe(false);
      expect(sendPaymentSchema.safeParse({ ...validBasePayment, amount: "1.12345678" }).success).toBe(false);
    });
  });

  describe("Conditional memo behavior and memo types", () => {
    it("accepts memoType 'none' when memo is undefined or empty", () => {
      expect(
        sendPaymentSchema.safeParse({ ...validBasePayment, memoType: "none" }).success
      ).toBe(true);
      expect(
        sendPaymentSchema.safeParse({ ...validBasePayment, memo: "", memoType: "none" }).success
      ).toBe(true);
    });

    it("rejects non-empty memo when memoType is 'none'", () => {
      const res = sendPaymentSchema.safeParse({
        ...validBasePayment,
        memo: "Unexpected Memo",
        memoType: "none",
      });
      expect(res.success).toBe(false);
    });

    it("rejects non-empty memo when memoType is missing", () => {
      const res = sendPaymentSchema.safeParse({
        ...validBasePayment,
        memo: "Orphaned Memo",
      });
      expect(res.success).toBe(false);
    });

    describe("memoType: 'text'", () => {
      it("accepts valid text memo up to 28 characters", () => {
        expect(
          sendPaymentSchema.safeParse({
            ...validBasePayment,
            memoType: "text",
            memo: "Thanks for dinner",
          }).success
        ).toBe(true);

        expect(
          sendPaymentSchema.safeParse({
            ...validBasePayment,
            memoType: "text",
            memo: "A".repeat(28),
          }).success
        ).toBe(true);
      });

      it("rejects text memo exceeding 28 characters", () => {
        const res = sendPaymentSchema.safeParse({
          ...validBasePayment,
          memoType: "text",
          memo: "A".repeat(29),
        });
        expect(res.success).toBe(false);
      });
    });

    describe("memoType: 'id'", () => {
      it("accepts valid numeric ID memo", () => {
        expect(
          sendPaymentSchema.safeParse({
            ...validBasePayment,
            memoType: "id",
            memo: "1234567890",
          }).success
        ).toBe(true);

        expect(
          sendPaymentSchema.safeParse({
            ...validBasePayment,
            memoType: "id",
            memo: "9".repeat(28),
          }).success
        ).toBe(true);
      });

      it("rejects malformed non-numeric values for ID memo", () => {
        const invalidIds = ["abc", "12a34", "-100", "12.34", "12 34", "id#123"];
        for (const id of invalidIds) {
          const res = sendPaymentSchema.safeParse({
            ...validBasePayment,
            memoType: "id",
            memo: id,
          });
          expect(res.success).toBe(false);
        }
      });

      it("rejects numeric ID exceeding max length", () => {
        const res = sendPaymentSchema.safeParse({
          ...validBasePayment,
          memoType: "id",
          memo: "1".repeat(29),
        });
        expect(res.success).toBe(false);
      });
    });

    describe("memoType: 'hash'", () => {
      const valid64Hex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      it("accepts valid 64-character hex hash memo (both lowercase and uppercase)", () => {
        expect(
          sendPaymentSchema.safeParse({
            ...validBasePayment,
            memoType: "hash",
            memo: valid64Hex,
          }).success
        ).toBe(true);

        expect(
          sendPaymentSchema.safeParse({
            ...validBasePayment,
            memoType: "hash",
            memo: valid64Hex.toUpperCase(),
          }).success
        ).toBe(true);
      });

      it("rejects malformed hash values (wrong length or non-hex)", () => {
        const malformedHashes = [
          "abc",
          "a".repeat(63), // too short
          "a".repeat(65), // too long
          "g".repeat(64), // non-hex character 'g'
          "z".repeat(64), // non-hex character 'z'
          valid64Hex.slice(0, 63) + "!", // invalid symbol
        ];

        for (const hash of malformedHashes) {
          const res = sendPaymentSchema.safeParse({
            ...validBasePayment,
            memoType: "hash",
            memo: hash,
          });
          expect(res.success).toBe(false);
        }
      });
    });
  });

  describe("validateSendPayment utility", () => {
    it("returns isValid: true and empty errors on valid input", () => {
      const result = validateSendPayment({
        recipientAddress: validStellarAddress,
        amount: "5.0",
        tokenType: "XLM",
        memoType: "text",
        memo: "Invoice 101",
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("returns isValid: false and descriptive error messages on malformed input", () => {
      const result = validateSendPayment({
        recipientAddress: "bad_address",
        amount: "-10",
        tokenType: "INVALID_COIN",
        memoType: "id",
        memo: "not-a-number",
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("validateMemo utility", () => {
    it("validates empty memo as true", () => {
      expect(validateMemo("", "none")).toBe(true);
      expect(validateMemo("", "text")).toBe(true);
    });

    it("validates text memo correctly", () => {
      expect(validateMemo("Valid note", "text")).toBe(true);
      expect(validateMemo("A".repeat(29), "text")).toBe(false);
    });

    it("validates id memo correctly", () => {
      expect(validateMemo("12345", "id")).toBe(true);
      expect(validateMemo("12a45", "id")).toBe(false);
    });

    it("validates hash memo correctly", () => {
      expect(validateMemo("a".repeat(64), "hash")).toBe(true);
      expect(validateMemo("a".repeat(63), "hash")).toBe(false);
      expect(validateMemo("g".repeat(64), "hash")).toBe(false);
    });
  });

  describe("sanitizePaymentInput utility", () => {
    it("trims whitespace and normalizes token and memo types", () => {
      const sanitized = sanitizePaymentInput({
        recipientAddress: "  " + validStellarAddress + "  ",
        amount: "  25.5  ",
        tokenType: "xlm",
        memoType: "TEXT",
        memo: "  Lunch  ",
        recipientContactId: "  c-1  ",
      });

      expect(sanitized).toEqual({
        recipientAddress: validStellarAddress,
        amount: "25.5",
        tokenType: "XLM",
        memoType: "text",
        memo: "Lunch",
        recipientContactId: "c-1",
      });
    });
  });
});

