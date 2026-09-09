import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// @testing-library/react's auto-cleanup only self-registers when `afterEach`
// is a bare global, which requires `test.globals: true` in vitest.config.ts.
// This project imports test globals explicitly instead, so without this,
// DOM trees from `render()` accumulate across `it` blocks in the same file.
afterEach(() => {
  cleanup();
});
