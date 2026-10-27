import { ProviderIcon } from './ProviderIcon';
import { memo, useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { activityLabel, activityWorkspaces, checkSummary, filterActivity, recentActivity, workspaceIdentity } from '../lib/activity';
import { ALLOWLISTED_TEST_PROFILES } from '../lib/proofOfWork';
import { isDesktop } from '../lib/desktop';
import { relativeTime } from '../lib/format';
import { PROVIDER_NAMES } from '../lib/sessionSummary';
import type { Provider } from '../types';
import type { Agent, AgentEvent, ProofSummary } from '../types';

function readFilter(key: string, allowed: string[]) {
  try { const value = localStorage.getItem(`stxic.halo.activity.${key}`); return value && allowed.includes(value) ? value : 'all'; } catch { return 'all'; }
}

export const ActivityView = memo(function ActivityView({ agents, events, demo, approvedWorkspaces, checks, onVerifyWorkspace, onWorkspaceSettings }: {
  agents: Agent[]; events: AgentEvent[]; demo: boolean;
  approvedWorkspaces: readonly string[];
  checks: Readonly<Record<string, ProofSummary>>;
  onVerifyWorkspace: (path: string, runTests: boolean, profile?: string) => Promise<ProofSummary | null>;
  onWorkspaceSettings: (path: string) => void;
}) {
  const workspaces = activityWorkspaces(agents, events);
  const [selection, setSelection] = useState('');
  const [checkSelection, setCheckSelection] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(6);
  const [providerFilter, setProviderFilter] = useState(() => readFilter('provider', ['all', ...Object.keys(PROVIDER_NAMES)]));
  const [eventFilter, setEventFilter] = useState(() => readFilter('event', ['all', 'attention', 'PermissionRequest', 'Error']));
  useEffect(() => { try { localStorage.setItem('stxic.halo.activity.provider', providerFilter); } catch { /* Session-only fallback. */ } }, [providerFilter]);
  useEffect(() => { try { localStorage.setItem('stxic.halo.activity.event', eventFilter); } catch { /* Session-only fallback. */ } }, [eventFilter]);
  const [busy, setBusy] = useState<{ key: string; tests: boolean } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const running = useRef(false);
  const selectedFilter = workspaces.find(workspace => workspace.key === selection);
  const selected = workspaces.find(workspace => workspace.key === checkSelection);
  const timeline = filterActivity(recentActivity(events, selectedFilter?.path, selectedFilter?.sessionIds), providerFilter, eventFilter);
  const activeFilters = Number(Boolean(selectedFilter)) + Number(providerFilter !== 'all') + Number(eventFilter !== 'all');
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
    <div className="activity-header"><div><h2>Recent activity</h2><p>What your agents have reported</p></div>
      <button type="button" className="inline-action activity-filter-toggle" aria-expanded={filtersOpen} aria-controls="activity-filters" onClick={() => setFiltersOpen(open => !open)}>Filters{activeFilters > 0 ? ` (${activeFilters})` : ''}</button>
    </div>
    {filtersOpen && <div id="activity-filters" className="activity-filter-panel">
    <div className="activity-filters">
      <label>Project<select value={selectedFilter?.key ?? ''} onChange={event => { setSelection(event.target.value); setVisibleCount(6); }}>
        <option value="">All projects</option>{workspaces.map(workspace => <option key={workspace.key} value={workspace.key}>{workspaces.filter(other => other.label === workspace.label).length > 1 ? workspace.path : workspace.label}</option>)}
      </select></label>
      <label>Provider<select value={providerFilter} onChange={event => { setProviderFilter(event.target.value); setVisibleCount(6); }}>
        <option value="all">All providers</option>{Object.entries(PROVIDER_NAMES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      <label>Event<select value={eventFilter} onChange={event => { setEventFilter(event.target.value); setVisibleCount(6); }}>
        <option value="all">All events</option><option value="attention">Needs attention</option><option value="PermissionRequest">Approval requests</option><option value="Error">Errors</option>
      </select></label>
    </div>
    {activeFilters > 0 && <button type="button" className="inline-action subtle-action clear-filters" onClick={() => { setSelection(''); setProviderFilter('all'); setEventFilter('all'); setVisibleCount(6); }}>Clear filters</button>}
    </div>}
    {timeline.length > 0 ? <>
      <ol className="activity-timeline" aria-label="Recent activity, newest first">
        {timeline.slice(0, visibleCount).map((event, index) => <li key={`${event.source}:${event.session_id}:${event.timestamp}:${event.event}:${index}`}>
          <ProviderIcon provider={event.source in PROVIDER_NAMES ? event.source as Provider : 'other'} />
          <div><strong>{activityLabel(event)}</strong><span>{PROVIDER_NAMES[event.source as Provider] ?? 'Agent'} · {event.cwd ? workspaces.find(w => w.key === workspaceIdentity(event.cwd!))?.label ?? 'Project unavailable' : 'Project unavailable'}</span>{(event.event === 'PermissionRequest' || event.event === 'Error') && <span className="activity-attention">Needs attention</span>}</div>
          <time dateTime={event.timestamp}>{demo ? 'Sample' : relativeTime(event.timestamp)}</time>
        </li>)}
      </ol>
      {timeline.length > visibleCount && <button type="button" className="inline-action subtle-action" onClick={() => setVisibleCount(count => count + 6)}>Show earlier activity</button>}
    </> : <div className="overview-empty">
      <Activity size={24} aria-hidden="true" /><strong>{activeFilters ? 'No matching activity' : 'No activity yet'}</strong>
      <p>{activeFilters ? 'Try changing or clearing your filters.' : 'Start a coding task to see what your agent is doing.'}</p>
    </div>}

    <details className="activity-checks">
      <summary>Files &amp; tests <span>Optional checks</span></summary>
      <div className="activity-check-content">
        <p>Choose a project to optionally check changed files or run tests.</p>
        <div className="activity-workspace-picker"><label htmlFor="activity-check-workspace">Project to check</label>
          <select id="activity-check-workspace" value={selected?.key ?? ''} onChange={event => setCheckSelection(event.target.value)}>
            <option value="">Choose a project</option>{workspaces.map(workspace => <option key={workspace.key} value={workspace.key}>{workspaces.filter(other => other.label === workspace.label).length > 1 ? workspace.path : workspace.label}</option>)}
          </select>{selected && <p className="activity-path" title={selected.path}>{selected.path}</p>}
        </div>
        {!selected ? <p>{workspaces.length ? 'Choose a project to see available checks.' : 'Projects appear here after an agent reports activity.'}</p> : <>
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
        </>}
      </div>
    </details>
  </div>;
});
