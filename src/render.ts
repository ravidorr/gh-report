import { type Cell, el, link, renderTable } from './dom.js';
import { ageDays, ageText, formatNumber } from './format.js';
import { alertCell, computeTotals, isNotChecked, sortRepos } from './summary.js';
import type { CollectionTarget, FailedWorkflow, Report, Repo, ScanStatus } from './types.js';

/** Data older than this is flagged: the daily workflow has probably stopped. */
const STALE_AFTER_HOURS = 36;
const MS_PER_HOUR = 3_600_000;

function byId(doc: Document, id: string): HTMLElement {
  const found = doc.getElementById(id);
  if (!found) {
    throw new Error(`Missing element #${id}`);
  }
  return found;
}

function tile(doc: Document, label: string, n: number, caption: string, tone: string, notChecked: number): HTMLElement {
  const unchecked = notChecked > 0;
  const sub = unchecked ? `${caption}, ${formatNumber(notChecked)} not checked` : caption;
  return el(
    doc,
    'div',
    { className: `tile ${n ? tone : 'tile-zero'}${unchecked ? ' tile-unchecked' : ''}` },
    el(doc, 'span', { className: 'tile-label', textContent: label }),
    el(doc, 'b', { className: 'tile-value', textContent: formatNumber(n) }),
    el(doc, 'span', { className: 'tile-sub', textContent: sub }),
  );
}

function renderTiles(doc: Document, repos: Repo[]): void {
  const t = computeTotals(repos);
  const n = t.notChecked;
  byId(doc, 'tiles').replaceChildren(
    tile(doc, 'Open pull requests', t.prs, 'across all repos', '', n.prs),
    tile(doc, 'Open issues', t.issues, 'pull requests excluded', '', n.issues),
    tile(doc, 'Failed workflows', t.failed, 'latest run per workflow', 'tile-bad', n.failed),
    tile(doc, 'Dependabot alerts', t.dependabot, `${formatNumber(t.malware)} malware`, 'tile-warn', n.dependabot),
    tile(doc, 'Code scanning alerts', t.codeScanning, 'open alerts', 'tile-warn', n.codeScanning),
    tile(doc, 'Secret scanning alerts', t.secretScanning, 'open alerts', 'tile-bad', n.secretScanning),
  );
}

/** Sorts below every real count, so "?", "-", "Not checked" and "Error" group together at the low end. */
const NO_COUNT = -1;

/** A count cell linking to `url`: "?" when the request failed (never 0), otherwise the number, toned when non-zero. */
function countCell(doc: Document, repo: Repo, target: CollectionTarget, count: number, tone: string, url: string): Cell {
  if (repo.collection_errors.includes(target)) {
    return [link(doc, '?', url), 'data-table-n data-table-warn', NO_COUNT];
  }
  return [link(doc, formatNumber(count), url), `data-table-n ${count ? tone : 'data-table-muted'}`, count];
}

function alertColumn(doc: Document, block: { status: ScanStatus; alerts: readonly unknown[]; url: string }, tone: string): Cell {
  const cell = alertCell(block.status, block.alerts.length);
  const toneClass = isNotChecked(block.status) ? 'data-table-warn' : block.alerts.length ? tone : 'data-table-muted';
  return [link(doc, cell, block.url), `data-table-n ${toneClass}`, block.status === 'ok' ? block.alerts.length : NO_COUNT];
}

/** The branch's own page. Slashes in branch names such as "feature/x" stay as path separators. */
function branchUrl(repoUrl: string, branch: string): string {
  return `${repoUrl}/tree/${branch.split('/').map(encodeURIComponent).join('/')}`;
}

function repoRow(doc: Document, repo: Repo): Cell[] {
  const tags = [repo.private && 'private', repo.fork && 'fork', repo.archived && 'archived']
    .filter(Boolean)
    .join(', ');
  return [
    [[link(doc, repo.name, repo.html_url), tags ? el(doc, 'span', { className: 'tag', textContent: tags }) : ''], '', repo.name],
    countCell(doc, repo, 'pulls', repo.open_prs.length, 'data-table-warn', `${repo.html_url}/pulls`),
    countCell(doc, repo, 'issues', repo.open_issues.length, 'data-table-warn', `${repo.html_url}/issues`),
    countCell(doc, repo, 'runs', repo.failed_workflows.length, 'data-table-bad', `${repo.html_url}/actions?query=is%3Afailure`),
    alertColumn(doc, repo.dependabot, 'data-table-warn'),
    alertColumn(doc, repo.code_scanning, 'data-table-warn'),
    alertColumn(doc, repo.secret_scanning, 'data-table-bad'),
    [
      link(doc, repo.branches.count === null ? '?' : formatNumber(repo.branches.count), repo.branches.url),
      'data-table-n data-table-muted',
      repo.branches.count ?? NO_COUNT,
    ],
  ];
}

function renderRepos(doc: Document, repos: Repo[]): void {
  renderTable(
    doc,
    'repos',
    [
      ['Repo'],
      ['Open PRs', 'data-table-n'],
      ['Open issues', 'data-table-n'],
      ['Failed workflows', 'data-table-n'],
      ['Dependabot', 'data-table-n'],
      ['Code scanning', 'data-table-n'],
      ['Secret scanning', 'data-table-n'],
      ['Branches', 'data-table-n'],
    ],
    sortRepos(repos).map((repo) => repoRow(doc, repo)),
    'No repos.',
  );
}

function renderLists(doc: Document, repos: Repo[]): void {
  renderTable(
    doc,
    'prs',
    [['Repo'], ['Pull request']],
    repos.flatMap((r) =>
      r.open_prs.map((p): Cell[] => [
        [link(doc, r.name, r.html_url)],
        [link(doc, `#${String(p.number)} ${p.title}${p.draft ? ' (draft)' : ''}`, p.url)],
      ]),
    ),
    'No open pull requests.',
  );
  renderTable(
    doc,
    'issues',
    [['Repo'], ['Issue']],
    repos.flatMap((r) =>
      r.open_issues.map((i): Cell[] => [[link(doc, r.name, r.html_url)], [link(doc, `#${String(i.number)} ${i.title}`, i.url)]]),
    ),
    'No open issues.',
  );
}

function renderFailed(doc: Document, repos: Repo[], now: number): void {
  const failed = repos
    .flatMap((r) => r.failed_workflows.map((f): FailedWorkflow & { repo: string; repoUrl: string } => ({ ...f, repo: r.name, repoUrl: r.html_url })))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const maxAge = Math.max(1, ...failed.map((f) => ageDays(f.created_at, now)));
  renderTable(
    doc,
    'failed',
    [['Repo'], ['Workflow'], ['Branch'], ['Latest failed run']],
    failed.map((f): Cell[] => {
      const days = ageDays(f.created_at, now);
      const bar = el(doc, 'div', { className: 'bar' });
      bar.style.width = `${String(Math.max(2, Math.round((100 * days) / maxAge)))}%`;
      return [
        [link(doc, f.repo, f.repoUrl)],
        [link(doc, f.workflow, f.url)],
        [link(doc, f.branch, branchUrl(f.repoUrl, f.branch))],
        [[link(doc, `${ageText(days)} ago (${f.created_at.slice(0, 10)})`, f.url), bar], '', new Date(f.created_at).getTime()],
      ];
    }),
    'No failed workflows.',
  );
}

/** Show a warning above the report when the data is old, so a stopped schedule does not go unnoticed. */
function renderStaleness(doc: Document, generatedAt: string, now: number): void {
  const hours = (now - new Date(generatedAt).getTime()) / MS_PER_HOUR;
  const banner = byId(doc, 'stale');
  const stale = Number.isNaN(hours) || hours > STALE_AFTER_HOURS;
  banner.hidden = !stale;
  banner.textContent = stale
    ? `This data is ${Number.isNaN(hours) ? 'of unknown age' : `${ageText(Math.floor(hours / 24))} old`}. The daily report may have stopped running: check the "Repo report" workflow.`
    : '';
}

/** Render the whole dashboard into the page. `now` is epoch milliseconds. */
export function renderDashboard(doc: Document, report: Report, now: number): void {
  const { repos } = report;
  byId(doc, 'lede').textContent = `${formatNumber(repos.length)} repos. Data from ${new Date(report.generated_at).toUTCString()}.`;
  renderStaleness(doc, report.generated_at, now);
  renderTiles(doc, repos);
  renderRepos(doc, repos);
  renderLists(doc, repos);
  renderFailed(doc, repos, now);
  // Revealed only once everything is rendered, so nothing on the page shifts while data arrives.
  byId(doc, 'content').hidden = false;
}
