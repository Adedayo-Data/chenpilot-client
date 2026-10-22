# Testing

This project uses Vitest with `jsdom` and Testing Library. The configuration is in [`vitest.config.ts`](../vitest.config.ts); [`src/test/setup.ts`](../src/test/setup.ts) loads `@testing-library/jest-dom` matchers.

## Commands

Run the full suite once:

```bash
pnpm test
```

Keep Vitest running and rerun affected tests as files change:

```bash
pnpm test:watch
```

Run the suite and print a V8 coverage report (also written to `coverage/`):

```bash
pnpm test:coverage
```

Pass a file path after `--` to run a focused test, for example:

```bash
pnpm test -- src/utils/passwordStrength.test.ts
```

## Placement And Naming

Vitest includes `src/**/*.test.ts` and `src/**/*.test.tsx` only. Put a test beside its implementation for a small, focused module, or group related tests in a local `__tests__` directory. Use `.test.ts` for non-React unit tests and `.test.tsx` for tests that render JSX. Existing examples include `src/utils/passwordStrength.test.ts`, `src/store/slices/chatSlice.test.ts`, and `src/components/ui/EmptyState.test.tsx`.

## Environment And Mocks

The default environment is `jsdom`, including for non-UI tests. That provides browser globals for components and code using browser APIs. For a test file that specifically needs Node rather than a DOM, put this directive at the top of the file:

```ts
// @vitest-environment node
```

Vitest globals (`describe`, `it`, `expect`, and lifecycle hooks) are enabled; explicit imports from `vitest` are also used in this repository and are preferred in new examples for clarity. Use `vi.mock()` at module scope to replace network services or other external dependencies, and `vi.fn()` for controllable functions. Reset mock call history in `beforeEach` with `vi.clearAllMocks()`. Avoid mocking the reducer or component under test. If a test changes environment variables, restore them after the test (or use Vitest's environment stubbing and undo it) so the next test is isolated.

## Slice Test Example

Create `src/store/slices/authSlice.test.ts` to exercise the reducer and a public action without involving a configured store or network:

```ts
import { describe, expect, it } from 'vitest';
import authReducer, { setToken } from './authSlice';

describe('authSlice', () => {
  it('stores a token and marks the user authenticated', () => {
    const state = authReducer(undefined, setToken('test-token'));

    expect(state.token).toBe('test-token');
    expect(state.isAuthenticated).toBe(true);
  });
});
```

## Component Test Example

Create `src/components/ui/EmptyState.test.tsx` to verify rendered content and a user action. Testing Library's `screen` queries roles and accessible names, while `fireEvent` triggers the button in this minimal example:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders its title and invokes its primary action', () => {
    const onClick = vi.fn();

    render(
      <EmptyState
        title="Nothing here"
        description="There are no items yet."
        action={{ label: 'Refresh', onClick }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

Run either example directly with `pnpm test -- <path-to-test>` or run all tests with `pnpm test`.

---

## Service API Contract Testing

Contract tests ensure the frontend service layer conforms strictly to backend API contracts without making real network calls.

- **File location**: [`src/services/__tests__/apiContracts.test.ts`](../src/services/__tests__/apiContracts.test.ts)
- **Covered surfaces**:
  - **Contacts**: `GET /contacts`, `POST /contacts`, `PUT /contacts/:id`, `DELETE /contacts/:id`
  - **Transactions**: `GET /account/:userId/transactions?page=1&limit=10`
  - **Account Funding**: `POST /api/fund` and Stellar Friendbot fallback
- **Contract rules**:
  - All Axios requests are mocked at module level using Vitest (`vi.mock('axios')`).
  - Request paths, HTTP verbs, query parameters, and JSON payloads are strictly asserted.
  - Error envelopes (400, 401, 403, 404, 429, 500, and network disconnections) and fallback behaviors are verified.
  - Run focused contract tests:
    ```bash
    pnpm test -- src/services/__tests__/apiContracts.test.ts
    ```

---

## Accessibility (a11y) Automated Checks

We use [`axe-core`](https://github.com/dequelabs/axe-core) and [`vitest-axe`](https://github.com/chaance/vitest-axe) to detect accessibility regressions automatically across representative views.

- **File location**: [`src/test/accessibility.test.tsx`](../src/test/accessibility.test.tsx)
- **Command**:
  ```bash
  pnpm test:a11y
  # or
  pnpm test -- src/test/accessibility.test.tsx
  ```
- **Tested Views**:
  - **Auth View**: `LoginForm` (input labels, password visibility toggle accessible state, `aria-required`, `aria-invalid`, `aria-describedby`).
  - **Dialog View**: `Modal` (focus trapping, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, Esc key behavior).
  - **Contacts View**: Contact creation and edit modal form controls, input labeling, and token selector names.
  - **Send View**: `SendPaymentForm` (amount, token type selector, recipient address, memo type accessible names).
- **Documented Exclusions**:
  - `region`: Excluded in isolated component unit tests because subtrees do not include top-level document landmark tags (`<header>`, `<main>`, `<footer>`).
  - `color-contrast`: Excluded in the headless JSDOM environment because JSDOM does not compute real layout geometry or pixel colors. True contrast is validated visually and in real browser E2E tests.

---

## End-to-End (E2E) Testing with Playwright

Playwright verifies user flows, routing, keyboard focus, viewport responsiveness, and backend error recovery across real browser engines.

- **Configuration**: [`playwright.config.ts`](../playwright.config.ts)
- **Suite location**: [`e2e/wallet-critical-paths.spec.ts`](../e2e/wallet-critical-paths.spec.ts)
- **Command**:
  ```bash
  pnpm test:e2e
  ```
- **Wallet-Critical Paths Covered**:
  1. **Login to Dashboard**: Testnet user authentication, credential submission, and redirection to authenticated workspace.
  2. **Contact Creation**: Navigating to contacts, opening modal, verifying keyboard focus management, filling and submitting new contact.
  3. **Payment Validation & Error Recovery**: Navigating to send, triggering client-side validation errors, 7-decimal precision handling (`0.0000001` XLM), and verifying graceful UI recovery on backend 503 errors.
  4. **Transaction History**: Rendering paginated transaction lists, status badges, and transaction details.
- **Security & Testnet Rules**:
  - **NEVER use mainnet credentials, secret keys, or seeds in tests.**
  - All E2E tests use deterministic route interception (`page.route()`) or testnet-specific addresses.
  - Test data adheres to the rules in [`CONTRIBUTING.md`](../CONTRIBUTING.md) and [`SECURITY.md`](../SECURITY.md).