// Types for `data.json`, as written by `gh-repo-report.sh`. The jq in that script defines the schema:
// keep the two in sync, and keep `parse.ts` (the runtime check) in sync with these types.

export type ScanStatus = 'ok' | 'disabled' | 'no_permission' | 'error';

/** The requests the collector makes per repo. A failed one is listed in `Repo.collection_errors`. */
export type CollectionTarget = 'branches' | 'pulls' | 'issues' | 'runs';

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  draft: boolean;
}

export interface Issue {
  number: number;
  title: string;
  url: string;
}

export interface FailedWorkflow {
  workflow: string;
  conclusion: 'failure' | 'timed_out' | 'startup_failure';
  branch: string;
  created_at: string;
  /** Omitted when the collector runs with `ALERT_DETAILS=false`. */
  path?: string;
  url: string;
}

// Alerts always carry `number` and `url`. The other fields are omitted when the collector runs with
// `ALERT_DETAILS=false` (see `Report.alert_details`), and GitHub can send null for any of them.

export interface DependabotAlert {
  number: number;
  url: string;
  package?: string | null;
  ecosystem?: string | null;
  scope?: string | null;
  severity?: string | null;
  classification?: string | null;
  summary?: string | null;
}

export interface CodeScanningAlert {
  number: number;
  url: string;
  rule?: string | null;
  tool?: string | null;
  severity?: string | null;
  path?: string | null;
  summary?: string | null;
}

export interface SecretScanningAlert {
  number: number;
  url: string;
  secret_type?: string | null;
  validity?: string | null;
  created_at?: string | null;
}

interface ScanBlock<TAlert> {
  status: ScanStatus;
  /** Error text from GitHub when `status` is not "ok"; always "" when `alert_details` is false. */
  message: string;
  /** Always empty when `status` is not "ok". */
  alerts: TAlert[];
  url: string;
}

export interface Dependabot extends ScanBlock<DependabotAlert> {
  /** A subset of `alerts`, not additional ones. */
  malware_alerts: Pick<DependabotAlert, 'number' | 'url' | 'package' | 'ecosystem' | 'summary'>[];
}

export type CodeScanning = ScanBlock<CodeScanningAlert>;
export type SecretScanning = ScanBlock<SecretScanningAlert>;

export interface Repo {
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  fork: boolean;
  archived: boolean;
  default_branch: string;
  /** `count` is null when the branches request failed (also listed in `collection_errors`). */
  branches: { count: number | null; url: string };
  /** Requests that failed. Their fields hold empty defaults and must be shown as "not checked", not 0. */
  collection_errors: CollectionTarget[];
  open_prs: PullRequest[];
  open_issues: Issue[];
  failed_workflows: FailedWorkflow[];
  dependabot: Dependabot;
  code_scanning: CodeScanning;
  secret_scanning: SecretScanning;
}

export interface Report {
  schema_version: 1;
  /** False when alerts were reduced to number and url. */
  alert_details: boolean;
  generated_at: string;
  repos: Repo[];
}
