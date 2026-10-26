import { memo, useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { activityLabel, activityWorkspaces, checkSummary, recentActivity, workspaceIdentity } from '../lib/activity';
import { ALLOWLISTED_TEST_PROFILES } from '../lib/proofOfWork';
import { isDesktop } from '../lib/desktop';
import { relativeTime } from '../lib/format';
import { PROVIDER_NAMES } from '../lib/sessionSummary';
import type { Provider } from '../types';
import type { Agent, AgentEvent, ProofSummary } from '../types';

export const ActivityView = memo(function ActivityView({ agents, events, demo, approvedWorkspaces, checks, onVerifyWorkspace, onWorkspaceSettings }: {
  agents: Agent[]; events: AgentEvent[]; demo: boolean;
  approvedWorkspaces: readonly string[];
  checks: Readonly<Record<string, ProofSummary>>;
  onVerifyWorkspace: (path: string, runTests: boolean, profile?: string) => Promise<ProofSummary | null>;
  onWorkspaceSettings: (path: string) => void;
}) {
  const workspaces = activityWorkspaces(agents, events);
  const [selection, setSelection] = useState<string | null>(null);
  const firstWorkspace = workspaces[0]?.key;
  useEffect(() => { if (selection === null && firstWorkspace) setSelection(firstWorkspace); }, [selection, firstWorkspace]);
  const [visibleCount, setVisibleCount] = useState(6);
  const [busy, setBusy] = useState<{ key: string; tests: boolean } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const running = useRef(false);
  const key = selection === null ? workspaces[0]?.key : selection;
  const selected = workspaces.find(workspace => workspace.key === key);
  const timeline = recentActivity(events, selected?.path, selected?.sessionIds);
  const proof = selected ? checks[selected.key] ?? selected.proof : null;
  const summary = checkSummary(proof);
  const authorized = Boolean(selected && approvedWorkspaces.some(path => workspaceIdentity(path) === selected.key));
  const canCheck = isDesktop() && !demo && authorized && !busy;
  const profile = selected ? profiles[selected.key] ?? '' : '';
  const checkedAt = proof?.evidenceTimestamp ?? proof?.evidence_timestamp;

  const run = async (tests: boolean) => {
    if (!selected || !canCheck || running.current || (tests && !profile)) return;
    const target = selected;
    running.current = true;
    setBusy({ key: target.key, tests });
    setErrors(previous => ({ ...previous, [target.key]: '' }));
    try {
      const result = await onVerifyWorkspace(target.path, tests, tests ? profile : undefined);
      if (!result) throw new Error('No result returned. Check the folder connection and try again.');
    } catch (error) {
      setErrors(previous => ({ ...previous, [target.key]: error instanceof Error ? error.message : String(error) }));
    } finally { running.current = false; setBusy(null); }
  };

  return <div className="section-scroll activity-simple" aria-label="Activity history and workspace checks">
    {workspaces.length > 0 && <div className="activity-workspace-picker">
      <label htmlFor="activity-workspace">Workspace</label>
      <select id="activity-workspace" value={selected?.key ?? ''} onChange={event => {
        setSelection(event.target.value); setVisibleCount(6);
      }}>
        <option value="">All activity</option>
        {workspaces.map(workspace => <option key={workspace.key} value={workspace.key}>{workspaces.filter(other => other.label === workspace.label).length > 1 ? workspace.path : workspace.label}</option>)}
      </select>
      {selected && <p className="activity-path" title={selected.path}>{selected.path}</p>}
    </div>}

    <div className="section-heading first-heading"><h2>Recent activity</h2><span className="subtle-label tabular">{timeline.length} events</span></div>
    {timeline.length > 0 ? <>
      <ol className="activity-timeline" aria-label="Recent activity, newest first">
        {timeline.slice(0, visibleCount).map((event, index) => <li key={`${event.source}:${event.session_id}:${event.timestamp}:${event.event}:${index}`}>
          <span className={`activity-event-mark ${event.event === 'PermissionRequest' || event.event === 'Error' ? 'needs-attention' : ''}`} aria-hidden="true" />
          <div><strong>{activityLabel(event)}</strong><span>{PROVIDER_NAMES[event.source as Provider] ?? 'Agent'}{!selected && event.cwd ? ` · ${workspaces.find(w => w.key === workspaceIdentity(event.cwd!))?.label ?? 'Workspace'}` : ''}</span></div>
          <time dateTime={event.timestamp}>{demo ? 'Sample' : relativeTime(event.timestamp)}</time>
        </li>)}
      </ol>
      {timeline.length > visibleCount && <button type="button" className="inline-action subtle-action" onClick={() => setVisibleCount(count => count + 6)}>Show earlier activity</button>}
    </> : <div className="overview-empty">
      <Activity size={24} aria-hidden="true" /><strong>No activity yet</strong>
      <p>{selected ? 'New actions from this workspace will appear here.' : 'Start a coding task to see what your agent is doing.'}</p>
    </div>}

    {selected ? <details className="activity-checks" key={selected.key}>
      <summary>Files &amp; tests <span>Optional checks</span></summary>
      <div className="activity-check-content">
        <p>Check this workspace when you want to review file changes or confirm test results.</p>
        {demo ? <p>Sample results. Switch off simulation to run real checks.</p> : !isDesktop() ? <p>Open the desktop app to run checks.</p> : !authorized ? <div className="activity-access">
          <p>Authorize this folder in Settings before checking files or running tests.</p>
          <button type="button" className="inline-action" onClick={() => onWorkspaceSettings(selected.path)}>Set up workspace</button>
        </div> : null}
        <div className="activity-check-result" aria-live="polite">
          <span>{summary.files}</span><span className={summary.failed ? 'amber-text' : ''}>{summary.tests}</span>
          {checkedAt && Number.isFinite(checkedAt) ? <small>Last checked {relativeTime(new Date(checkedAt).toISOString())} · results are a snapshot</small> : null}
        </div>
        <button type="button" className="inline-action" disabled={!canCheck} onClick={() => void run(false)}>{busy?.key === selected.key && !busy.tests ? 'Checking files…' : 'Check files'}</button>
        {proof?.git && proof.git.files.length > 0 && <details className="activity-file-details"><summary>{proof.git.files.length} changed files</summary>
          <ul className="activity-files">{proof.git.files.map(file => <li key={file.path}><span>{file.path}</span><small>{file.status.includes('untracked') ? 'New file' : file.staged ? 'Staged' : 'Modified'}</small></li>)}</ul>
        </details>}
        <div className="activity-test-controls">
          <label htmlFor="activity-test-profile">Test command</label>
          <select id="activity-test-profile" value={profile} disabled={!canCheck} onChange={event => setProfiles(previous => ({ ...previous, [selected.key]: event.target.value }))}>
            <option value="">Choose a command</option>{ALLOWLISTED_TEST_PROFILES.map(command => <option value={command} key={command}>{command}</option>)}
          </select>
          <button type="button" className="inline-action" disabled={!canCheck || !profile} onClick={() => void run(true)}>{busy?.key === selected.key && busy.tests ? 'Running tests…' : 'Run tests'}</button>
        </div>
        {errors[selected.key] && <p className="activity-check-error" role="alert">{errors[selected.key]}</p>}
      </div>
    </details> : workspaces.length > 0 ? <p className="activity-check-hint">Choose a workspace above to review its files and tests.</p> : null}
  </div>;
});
