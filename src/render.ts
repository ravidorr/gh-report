import { type Cell, el, link, renderTable } from './dom.js';
import { ageDays, ageText, formatNumber } from './format.js';
import { alertCell, computeTotals, sortRepos } from './summary.js';
import type { FailedWorkflow, Report, Repo } from './types.js';

function byId(doc: Document, id: string): HTMLElement {
  const found = doc.getElementById(id);
  if (!found) {
    throw new Error(`Missing element #${id}`);
  }
  return found;
}

function tile(doc: Document, label: string, n: number, sub: string, tone: string): HTMLElement {
  return el(
    doc,
    'div',
    { className: `tile ${n ? tone : 'tile-zero'}` },
    el(doc, 'span', { className: 'tile-label', textContent: label }),
    el(doc, 'b', { className: 'tile-value', textContent: formatNumber(n) }),
    el(doc, 'span', { className: 'tile-sub', textContent: sub }),
  );
}

function renderTiles(doc: Document, repos: Repo[]): void {
  const t = computeTotals(repos);
  byId(doc, 'tiles').replaceChildren(
    tile(doc, 'Open pull requests', t.prs, 'across all repos', ''),
    tile(doc, 'Open issues', t.issues, 'pull requests excluded', ''),
    tile(doc, 'Failed workflows', t.failed, 'latest run per workflow', 'tile-bad'),
    tile(
      doc,
      'Dependabot alerts',
      t.dependabot,
      `${formatNumber(t.malware)} malware, ${formatNumber(t.checked)} repos checked, ${formatNumber(repos.length - t.checked)} not checked`,
      'tile-warn',
    ),
    tile(doc, 'Code scanning alerts', t.codeScanning, 'open alerts', 'tile-warn'),
    tile(doc, 'Secret scanning alerts', t.secretScanning, 'open alerts', 'tile-bad'),
  );
}

function countCell(doc: Document, label: string, href: string, count: number, tone: string): Cell {
  return [link(doc, label, href), `data-table-n ${count ? tone : 'data-table-muted'}`];
}

function repoRow(doc: Document, repo: Repo): Cell[] {
  const tags = [repo.private && 'private', repo.fork && 'fork', repo.archived && 'archived']
    .filter(Boolean)
    .join(', ');
  const { dependabot, code_scanning: code, secret_scanning: secret } = repo;
  return [
    [[link(doc, repo.name, repo.html_url), tags ? el(doc, 'span', { className: 'tag', textContent: tags }) : '']],
    [link(doc, formatNumber(repo.branches.count ?? 0), repo.branches.url), 'data-table-n data-table-muted'],
    [formatNumber(repo.open_prs.length), `data-table-n ${repo.open_prs.length ? 'data-table-warn' : 'data-table-muted'}`],
    [formatNumber(repo.open_issues.length), `data-table-n ${repo.open_issues.length ? 'data-table-warn' : 'data-table-muted'}`],
    [
      formatNumber(repo.failed_workflows.length),
      `data-table-n ${repo.failed_workflows.length ? 'data-table-bad' : 'data-table-muted'}`,
    ],
    countCell(doc, alertCell(dependabot.status, dependabot.alerts.length), dependabot.url, dependabot.alerts.length, 'data-table-warn'),
    countCell(doc, alertCell(code.status, code.alerts.length), code.url, code.alerts.length, 'data-table-warn'),
    countCell(doc, alertCell(secret.status, secret.alerts.length), secret.url, secret.alerts.length, 'data-table-bad'),
  ];
}

function renderRepos(doc: Document, repos: Repo[]): void {
  renderTable(
    doc,
    'repos',
    [
      ['Repo'],
      ['Branches', 'data-table-n'],
      ['Open PRs', 'data-table-n'],
      ['Open issues', 'data-table-n'],
      ['Failed workflows', 'data-table-n'],
      ['Dependabot', 'data-table-n'],
      ['Code scanning', 'data-table-n'],
      ['Secret scanning', 'data-table-n'],
    ],
    sortRepos(repos).map((repo) => repoRow(doc, repo)),
  );
}

function renderLists(doc: Document, repos: Repo[]): void {
  renderTable(
    doc,
    'prs',
    [['Repo'], ['Pull request']],
    repos.flatMap((r) =>
      r.open_prs.map((p): Cell[] => [[r.name], [link(doc, `#${String(p.number)} ${p.title}${p.draft ? ' (draft)' : ''}`, p.url)]]),
    ),
  );
  renderTable(
    doc,
    'issues',
    [['Repo'], ['Issue']],
    repos.flatMap((r) => r.open_issues.map((i): Cell[] => [[r.name], [link(doc, `#${String(i.number)} ${i.title}`, i.url)]])),
  );
}

function renderFailed(doc: Document, repos: Repo[], now: number): void {
  const failed = repos
    .flatMap((r) => r.failed_workflows.map((f): FailedWorkflow & { repo: string } => ({ repo: r.name, ...f })))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const maxAge = Math.max(1, ...failed.map((f) => ageDays(f.created_at, now)));
  renderTable(
    doc,
    'failed',
    [['Repo'], ['Workflow'], ['Branch'], ['Failing for (run date)']],
    failed.map((f): Cell[] => {
      const days = ageDays(f.created_at, now);
      const bar = el(doc, 'div', { className: 'bar' });
      bar.style.width = `${String(Math.max(2, Math.round((100 * days) / maxAge)))}%`;
      return [[f.repo], [link(doc, f.workflow, f.url)], [f.branch], [[`${ageText(days)} (${f.created_at.slice(0, 10)})`, bar]]];
    }),
  );
}

/** Render the whole dashboard into the page. `now` is epoch milliseconds. */
export function renderDashboard(doc: Document, report: Report, now: number): void {
  const { repos } = report;
  byId(doc, 'lede').textContent = `${formatNumber(repos.length)} repos. Data from ${new Date(report.generated_at).toUTCString()}.`;
  renderTiles(doc, repos);
  renderRepos(doc, repos);
  renderLists(doc, repos);
  renderFailed(doc, repos, now);
  // Revealed only once everything is rendered, so nothing on the page shifts while data arrives.
  byId(doc, 'content').hidden = false;
}
