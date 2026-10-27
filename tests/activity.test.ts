import { describe, expect, it } from 'vitest';
import { activityLabel, activityWorkspaces, applyWorkspaceChecks, checkSummary, filterActivity, recentActivity, workspaceIdentity } from '../src/lib/activity';
import type { Agent, AgentEvent, ProofSummary } from '../src/types';

const event = (patch: Partial<AgentEvent> = {}): AgentEvent => ({ schema_version: 1, source: 'codex',
  session_id: 'session', timestamp: '2026-10-26T10:00:00Z', event: 'SessionStart', cwd: 'C:\\work\\app', ...patch });
const agent = (patch: Partial<Agent> = {}): Agent => ({ id: 'session', provider: 'codex', name: 'Codex', task: 'Working',
  workspace: 'app', workspacePath: 'C:\\work\\app', status: 'working', contextPercent: null, tokenUsage: null,
  lastSeen: '2026-10-26T10:00:00Z', proof: null, isDemo: false, ...patch });
const proof: ProofSummary = { verified: true, testsPassed: 12, testsFailed: 0, evidenceTimestamp: 20 };

describe('Activity workspace flow', () => {
  it('groups sessions by full path, keeping folders with the same display name distinct', () => {
    const groups = activityWorkspaces([agent(), agent({ id: 'other', workspacePath: 'D:\\work\\app' })], [event({ cwd: 'c:/work/app/', session_id: 'third' })]);
    expect(groups).toHaveLength(2);
    const c = groups.find(group => group.key === 'c:/work/app');
    expect(c?.sessionIds.size).toBe(2);
    expect(c?.path).toBe('C:\\work\\app');
    expect(activityWorkspaces([agent({ workspacePath: undefined })], [])).toEqual([]);
    expect(workspaceIdentity('/work/App')).not.toBe(workspaceIdentity('/work/app'));
  });
  it('finds workspace paths from events when an adapter supplies only a display name', () => {
    expect(activityWorkspaces([agent({ workspacePath: undefined })], [event()])[0].path).toBe('C:\\work\\app');
  });
  it('sorts newest first, removes exact duplicates and filters the selected workspace', () => {
    const old = event();
    const latest = event({ timestamp: '2026-10-26T11:00:00Z', event: 'Stop' });
    const elsewhere = event({ cwd: 'D:\\work\\app' });
    expect(recentActivity([old, elsewhere, latest, old], 'c:/work/app')).toEqual([latest, old]);
    expect(recentActivity([old, latest])).toEqual([latest, old]);
  });
  it('associates pathless events only with session IDs belonging to the selected workspace', () => {
    const linked = event({ cwd: undefined });
    const unrelated = event({ cwd: undefined, session_id: 'other' });
    expect(recentActivity([linked, unrelated], 'C:\\work\\app', new Set(['session']))).toEqual([linked]);
  });
  it('retains check results through a poll without assigning them to a similarly named folder', () => {
    const initial = [agent(), agent({ id: 'other', workspacePath: 'D:\\work\\app' })];
    const updated = applyWorkspaceChecks(initial, { 'c:/work/app': proof });
    expect(updated[0].proof).toBe(proof);
    expect(updated[1].proof).toBeNull();
    expect(initial[0].proof).toBeNull();
    expect(applyWorkspaceChecks([agent({ proof: { ...proof, evidenceTimestamp: 30 } })], { 'c:/work/app': proof })[0].proof?.evidenceTimestamp).toBe(30);
  });
  it('does not call unrun, empty or failed tests a success', () => {
    expect(checkSummary(null)).toMatchObject({ files: 'Files not checked', tests: 'Tests not run' });
    expect(checkSummary({ verified: false, testsPassed: 0, testsFailed: 0 }).tests).toBe('No passing tests confirmed');
    expect(checkSummary({ verified: false, testsPassed: 10, testsFailed: 2 })).toMatchObject({ tests: '2 tests failed', failed: true });
    expect(checkSummary(proof).tests).toBe('12 tests passed');
  });
  it('uses readable actions for internal lifecycle events', () => {
    expect(activityLabel(event({ event: 'PreToolUse', tool_name: 'task_started' }))).toBe('Working on a task');
    expect(activityLabel(event({ event: 'PermissionRequest' }))).toBe('Waiting for your approval');
    expect(activityLabel(event({ event: 'Stop' }))).toBe('Agent finished its turn');
  });
});

it('filters by provider and attention category together', () => {
  const events = [event({ event: 'Error' }), event({ event: 'PermissionRequest', source: 'claude-code' }), event(), event({ source: 'unknown', event: 'Error' })];
  expect(filterActivity(events, 'codex', 'attention')).toEqual([events[0]]);
  expect(filterActivity(events, 'all', 'PermissionRequest')).toEqual([events[1]]);
  expect(filterActivity(events, 'other', 'all')).toEqual([events[3]]);
});
