#!/usr/bin/env node
import { main } from '../src/cli.mjs';

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`\n  ✖ ${message}\n\n`);
  process.exitCode = 1;
});
