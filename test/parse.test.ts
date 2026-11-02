import { describe, expect, it } from 'vitest';

import { parseReport } from '../src/parse.js';
import { readSample } from './helpers.js';

const REMOVE = Symbol('remove');
type Node = Record<string, unknown>;

/** A fresh copy of the valid sample with one value at a dotted path (for example "repos.0.name") changed or removed. */
function changed(path: string, value: unknown): unknown {
  const report = JSON.parse(readSample()) as Node;
  const keys = path.split('.');
  const last = keys.pop() ?? '';
  const parent = keys.reduce<Node>((node, key) => node[key] as Node, report);
  if (value === REMOVE) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete parent[last];
  } else {
    parent[last] = value;
  }
  return report;
}

describe('parseReport', () => {
  it('accepts the sample report and returns it unchanged', () => {
    expect(parseReport(JSON.parse(readSample()))).toEqual(JSON.parse(readSample()));
  });

  it.each([
    ['no repos', 'repos', []],
    ['an unknown branch count', 'repos.0.branches.count', null],
    ['alerts reduced to a number and a link', 'repos.0.dependabot.alerts', [{ number: 1, url: 'https://github.com/x/y/1' }]],
  ])('accepts %s', (_label, path, value) => {
    expect(() => parseReport(changed(path, value))).not.toThrow();
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'x'],
  ])('rejects %s', (_label, value) => {
    expect(() => parseReport(value)).toThrow('the report should be an object');
  });

  it('explains how to fix a file from an older collector', () => {
    expect(() => parseReport(changed('schema_version', REMOVE))).toThrow('older collector');
  });

  it.each([
    ['an unsupported schema version', 'schema_version', 2, 'schema_version 2'],
    ['a non-boolean alert_details', 'alert_details', 'yes', 'alert_details should be true or false'],
    ['an invalid generated_at', 'generated_at', 'garbage', 'generated_at should be an ISO date'],
    ['a non-string generated_at', 'generated_at', 5, 'generated_at should be a string'],
    ['repos that are not an array', 'repos', {}, 'repos should be an array'],
    ['a repo that is not an object', 'repos.0', 'x', 'repos[0] should be an object'],
    ['a non-string repo name', 'repos.1.name', 3, 'repos[1].name should be a string'],
    ['a repo link that is not GitHub', 'repos.0.html_url', 'javascript:alert(1)', 'repos[0].html_url should be a https://github.com/ URL'],
    ['a non-boolean flag', 'repos.0.private', 'no', 'repos[0].private should be true or false'],
    ['a non-numeric branch count', 'repos.0.branches.count', '3', 'repos[0].branches.count should be a number'],
    ['an infinite branch count', 'repos.0.branches.count', Infinity, 'repos[0].branches.count should be a number'],
    ['an unknown collection error', 'repos.0.collection_errors', ['nope'], 'collection_errors[0] should be one of'],
    ['missing collection errors', 'repos.0.collection_errors', REMOVE, 'repos[0].collection_errors should be an array'],
    ['a pull request without a number', 'repos.0.open_prs.0.number', REMOVE, 'repos[0].open_prs[0].number should be a number'],
    ['a pull request link that is not GitHub', 'repos.0.open_prs.1.url', 'https://evil.test/', 'repos[0].open_prs[1].url'],
    ['an issue without a title', 'repos.0.open_issues.0.title', REMOVE, 'repos[0].open_issues[0].title'],
    ['an unknown conclusion', 'repos.0.failed_workflows.0.conclusion', 'cancelled', 'failed_workflows[0].conclusion should be one of'],
    ['an invalid run date', 'repos.0.failed_workflows.0.created_at', 'x', 'failed_workflows[0].created_at should be an ISO date'],
    ['an unknown scan status', 'repos.0.dependabot.status', 'weird', 'dependabot.status should be one of'],
    ['a non-string message', 'repos.0.code_scanning.message', 1, 'code_scanning.message should be a string'],
    ['alerts that are not an array', 'repos.0.secret_scanning.alerts', null, 'secret_scanning.alerts should be an array'],
    ['an alert without a link', 'repos.0.dependabot.alerts.0.url', REMOVE, 'dependabot.alerts[0].url'],
    ['an alert without a number', 'repos.0.code_scanning.alerts.0.number', 'x', 'code_scanning.alerts[0].number'],
    ['missing malware alerts', 'repos.0.dependabot.malware_alerts', REMOVE, 'dependabot.malware_alerts should be an array'],
    ['a missing scan block', 'repos.2.code_scanning', REMOVE, 'repos[2].code_scanning should be an object'],
  ])('rejects %s and names the path', (_label, path, value, message) => {
    expect(() => parseReport(changed(path, value))).toThrow(message);
  });
});
