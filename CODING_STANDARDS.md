# Coding standards

Review-time rules: judgement calls no linter can make. Mechanical rules live in checks instead (ESLint, `src/test/cssTokens.test.ts`, the husky hooks).

## E2E locators

Locate what a test clicks or waits on by **role + accessible name**, written as a plain string (`getByRole('button', { name: 'Generate', exact: true })`), or by `data-testid` when the element has no stable name.

A regex over visible prose (`getByText(/Skip.*edit manually/i)`) hides from a copy change's search-and-replace, so the test breaks silently on the next copy edit. Asserting on prose is fine only when the prose is itself the behaviour under test (for example, the stale-note banner's wording).
