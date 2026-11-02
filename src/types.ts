/** Shape of `data.json`, as written by `gh-repo-report.sh`. */

export type ScanStatus = 'ok' | 'disabled' | 'no_permission' | 'error';

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
  conclusion: string;
  branch: string;
  created_at: string;
  path: string;
  url: string;
}

/** Alerts always carry `number` and `url`; the other fields are omitted when the collector runs with `ALERT_DETAILS=false`. */
export interface DependabotAlert {
  number: number;
  url: string;
  package?: string;
  ecosystem?: string;
  scope?: string | null;
  severity?: string;
  classification?: string;
  summary?: string;
}

export interface CodeScanningAlert {
  number: number;
  url: string;
  rule?: string;
  tool?: string;
  severity?: string | null;
  path?: string;
  summary?: string;
}

export interface SecretScanningAlert {
  number: number;
  url: string;
  secret_type?: string;
  validity?: string | null;
  created_at?: string;
}

interface ScanBlock<TAlert> {
  status: ScanStatus;
  message: string;
  alerts: TAlert[];
  url: string;
}

export interface Dependabot extends ScanBlock<DependabotAlert> {
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
  branches: { count: number | null; url: string };
  open_prs: PullRequest[];
  open_issues: Issue[];
  failed_workflows: FailedWorkflow[];
  dependabot: Dependabot;
  code_scanning: CodeScanning;
  secret_scanning: SecretScanning;
}

export interface Report {
  generated_at: string;
  repos: Repo[];
}
