import { renderDashboard } from './render.js';
import type { Report } from './types.js';

/** Fetch `data.json` and render it; on failure show the reason in the lede instead. */
export async function load(doc: Document, fetchFn: typeof fetch, now: number): Promise<void> {
  try {
    const response = await fetchFn('data.json');
    if (!response.ok) {
      throw new Error(`HTTP ${String(response.status)}`);
    }
    renderDashboard(doc, (await response.json()) as Report, now);
  } catch (error) {
    const lede = doc.getElementById('lede');
    if (lede) {
      lede.textContent = `Could not load data.json: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
