// Quality gate between collecting the data and deploying it. A report full of zeros that really mean
// "could not read" would be published as an all-clear, so fail the job instead and keep the last good site.
//
//   node scripts/verify-report.mjs dist/data.json
//
// Fails when:
//   - there are no repos (a token limited to a few repos, or filters that exclude everything),
//     unless ALLOW_EMPTY_REPORT=true;
//   - any request failed (collection_errors) or any alert API returned a status of "error";
//   - more than MAX_NOT_CHECKED_SHARE (default 0.2) of the repos have "no_permission" for one alert API,
//     which usually means the token lacks a scope.
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BLOCKS = ['dependabot', 'code_scanning', 'secret_scanning'];

/** Return a list of problems found in the parsed report (empty when it is fine to publish). */
export function findProblems(report, env = {}) {
  const problems = [];
  const repos = report.repos ?? [];
  const maxShare = Number(env.MAX_NOT_CHECKED_SHARE ?? 0.2);

  if (repos.length === 0 && env.ALLOW_EMPTY_REPORT !== 'true') {
    problems.push('The report has no repositories. Check the token access and the INCLUDE_*/EXCLUDE_REPOS settings, or set ALLOW_EMPTY_REPORT=true.');
  }
  for (const repo of repos) {
    if (repo.collection_errors.length > 0) {
      problems.push(`${repo.full_name}: these requests failed: ${repo.collection_errors.join(', ')}`);
    }
    for (const block of BLOCKS) {
      if (repo[block].status === 'error') {
        problems.push(`${repo.full_name}: the ${block} API returned an error`);
      }
    }
  }
  for (const block of BLOCKS) {
    const blind = repos.filter((repo) => repo[block].status === 'no_permission').length;
    if (repos.length > 0 && blind / repos.length > maxShare) {
      problems.push(`${String(blind)} of ${String(repos.length)} repos have no permission for ${block}: check the token scopes`);
    }
  }
  return problems;
}

function main(path) {
  const problems = findProblems(JSON.parse(readFileSync(path, 'utf8')), process.env);
  for (const problem of problems) {
    console.log(`::error::${problem}`);
  }
  if (problems.length > 0) {
    console.error(`verify-report: ${String(problems.length)} problem(s), not publishing ${path}.`);
    process.exit(1);
  }
  console.log(`verify-report: ${path} looks complete.`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv[2] ?? 'dist/data.json');
}
