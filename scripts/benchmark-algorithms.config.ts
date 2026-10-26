// Vitest configuration for pnpm bench:algorithms: the algorithm measures in a single worker.
import { defineConfig } from 'vitest/config'
import shared from '../vitest.config.ts'

export default defineConfig({
  ...shared,
  test: {
    ...shared.test,
    include: ['tests/algorithm-performance.measure.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 300_000,
  },
})
