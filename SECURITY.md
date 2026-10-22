# Security Policy

## Supported Versions

Security updates and patches are provided exclusively for the latest stable release on the `main` branch of **Chenpilot Client (`gear5labs/chenpilot-client`)**.

| Version | Supported          |
| :---    | :---               |
| `main`  | :white_check_mark: |
| `< 1.0` | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability within Chenpilot Client, please **do not open a public GitHub issue**. Public disclosures can put users and wallet assets at risk before a patch is available.

- **Private Reporting Channel**: Please report vulnerabilities via [GitHub Security Advisories (Private Vulnerability Reporting)](https://github.com/gear5labs/chenpilot-client/security/advisories/new) or by emailing our security team at `security@gear5labs.example` (replace with official contact).
- **Expected Response Time**: We acknowledge receipt of vulnerability reports within **24 to 48 hours**, and provide an initial remediation assessment within **5 business days**.

---

## Secret-Handling & Development Rules

To maintain the security of credentials, API keys, and user assets, all contributors must adhere to the following rules:

1. **`.env` File Handling**:
   - Never commit `.env`, `.env.local`, or any file containing actual secrets to version control.
   - Always use `.env.example` as the canonical template containing safe placeholder values.
2. **Issue-Publishing & Release Tokens**:
   - The automated release and publishing script reads `GITHUB_TOKEN` locally from your un-tracked `.env` or `.env.local`.
   - Never hardcode personal access tokens or API keys into source files or commit histories.
3. **Log Redaction**:
   - Ensure that logging utilities never output sensitive data such as authentication headers, bearer tokens, private keys, session cookies, or user PII.
4. **Testnet-Only Practices & Credential Safeguards**:
   - **Mainnet Prohibited**: Never commit, configure, or use mainnet secret keys (`S...`), seed phrases, or production wallet credentials in this repository.
   - **Testnet-Only Test Data**: All automated tests, fixtures, and mock seeds must target the Stellar Testnet exclusively.
   - **Deterministic Test Mocking**: Network requests in unit and E2E suites must use deterministic mocks (`vi.mock('axios')` or Playwright route interception). Do not rely on live network credentials during automated testing.

---

## Wallet Transaction Security & Precision Handling

Because Chenpilot Client signs and prepares transactions:
1. **Transaction Confirmation UX**:
   - The user must always be presented with an explicit confirmation step before any transaction or smart contract call is submitted.
   - The confirmation UI must clearly state the recipient address, asset code, exact numerical amount, estimated fee, and network type (Testnet).
2. **Precision & Overflow Safeguards**:
   - Stellar amounts must respect 7-decimal precision (1 stroop = `0.0000001` XLM).
   - Floating-point arithmetic must never be used for financial accounting or transaction construction. Amounts must be represented as strings or BigInt integers to prevent truncation and precision exploits.

---

## Client Browser Storage & Security Implications

Because Chenpilot Client operates as a web-based client workspace and wallet application:
- **Storage Profile**: Sensitive authentication tokens and session states are stored in browser storage mechanisms (`localStorage` / encrypted cookies).
- **Security Implications**: Stored tokens are susceptible to theft if the client environment is compromised via Cross-Site Scripting (XSS). Contributors must maintain rigorous Content Security Policies (CSP), sanitize all user inputs, and keep third-party dependencies updated.

---

## Related Documentation

- [Contributing Guidelines & Wallet Flow Checklist (`CONTRIBUTING.md`)](CONTRIBUTING.md)
- [Backend API Contract (`docs/API_CONTRACT.md`)](docs/API_CONTRACT.md)
- [Testing & Quality Guide (`docs/TESTING.md`)](docs/TESTING.md)