// Render coverage/coverage-summary.json as a Markdown table for the CI job summary and the PR comment.
// Requires the "json-summary" coverage reporter (Vitest and Jest both support it).
import { existsSync, readFileSync } from 'node:fs';

const MARKER = '<!-- coverage-report -->';
const file = process.argv[2] ?? 'coverage/coverage-summary.json';

if (!existsSync(file)) {
  console.log(`${MARKER}\n### Coverage\n\nNo coverage summary found at \`${file}\`. The tests may have failed before coverage was collected.`);
  process.exit(0);
}

const { total } = JSON.parse(readFileSync(file, 'utf8'));
const metrics = [
  ['Lines', total.lines],
  ['Statements', total.statements],
  ['Functions', total.functions],
  ['Branches', total.branches],
];
const rows = metrics.map(([name, m]) => `| ${name} | ${m.pct}% | ${m.covered}/${m.total} | ${m.pct === 100 ? 'pass' : 'FAIL (100% required)'} |`);

console.log(
  [MARKER, '### Coverage', '', '| Metric | Coverage | Covered | Status |', '| --- | --- | --- | --- |', ...rows, ''].join('\n'),
);
