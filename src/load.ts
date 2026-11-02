import { parseReport } from './parse.js';
import { renderDashboard } from './render.js';
import type { Report } from './types.js';

function showError(doc: Document, prefix: string, error: unknown): void {
  console.error(error);
  const lede = doc.getElementById('lede');
  if (lede) {
    lede.textContent = `${prefix}: ${error instanceof Error ? error.message : String(error)}`;
    lede.setAttribute('role', 'alert');
  }
}

/**
 * Fetch `data.json`, check it, and render it. A fetch or shape problem and a render problem are
 * reported separately, in the lede, and logged to the console with their stack.
 */
export async function load(doc: Document, fetchFn: typeof fetch, now: number): Promise<void> {
  let report: Report;
  try {
    const response = await fetchFn('data.json');
    if (!response.ok) {
      throw new Error(`HTTP ${String(response.status)}`);
    }
    report = parseReport(await response.json());
  } catch (error) {
    showError(doc, 'Could not load data.json', error);
    return;
  }
  try {
    renderDashboard(doc, report, now);
  } catch (error) {
    showError(doc, 'Could not render the report', error);
  }
}
