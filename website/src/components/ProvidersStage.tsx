import { useState } from 'react';
import { Check, RotateCcw, ShieldAlert, Terminal, X } from 'lucide-react';
import { ProviderIcon, type ProviderId } from './ProviderIcon';

interface ProviderDetail {
  id: ProviderId;
  name: string;
  sourceMethod: string;
  sessionTokens: string;
  sessionCost: string;
  subscriptionQuota: string;
  contextRemaining: string;
  retention: string;
  honestNote: string;
  hasPermissionPreview?: boolean;
  setupTitle?: string;
  setupSourceLabel?: string;
  setupDetail?: string;
}

const PROVIDERS: ProviderDetail[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    sourceMethod: 'Opt-in PowerShell lifecycle hook and CLI status line',
    sessionTokens: '187,420 tokens',
    sessionCost: '$1.42 reported',
    subscriptionQuota: '78% 5h left · 84% 1w left',
    contextRemaining: '62% context remaining',
    retention: 'Retained 1 hour after Stop',
    honestNote: 'Separates per-session tokens and cost from 5-hour and 1-week plan limits.',
    hasPermissionPreview: true,
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    sourceMethod: 'Opt-in local hook bridge and agy CLI status line',
    sessionTokens: 'Unavailable (not exported)',
    sessionCost: 'Unavailable',
    subscriptionQuota: '81% quota window left',
    contextRemaining: 'Unavailable',
    retention: 'Retained 1 hour after Stop',
    honestNote: 'Displays exact quota reported by agy and marks unexported token totals as unavailable instead of guessing.',
    setupTitle: 'Local hook bridge and agy status source',
    setupSourceLabel: 'Settings · Antigravity hook',
    setupDetail: 'Connect in Halo Settings to install the local hook bridge (with a .halo-bak config backup) and read quota windows directly from the agy CLI.',
  },
  {
    id: 'codex',
    name: 'Codex',
    sourceMethod: 'Local session log reader (zero hooks required)',
    sessionTokens: '92,180 tokens',
    sessionCost: 'Unavailable',
    subscriptionQuota: '64% 5h left · 79% 1w left',
    contextRemaining: '71% context remaining',
    retention: 'Retained 1 hour after completion',
    honestNote: 'Reads local Codex session logs directly to surface logged quota snapshots and token counts.',
    setupTitle: 'Zero-hook local session log reader',
    setupSourceLabel: 'Local Codex logs',
    setupDetail: 'Reads Codex session logs directly from disk without installing hooks or modifying your Codex configuration.',
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot CLI',
    sourceMethod: 'Opt-in local integration and recorded usage logs',
    sessionTokens: '44,800 tokens',
    sessionCost: '14 premium requests',
    subscriptionQuota: 'Unavailable (plan cap not local)',
    contextRemaining: 'Unavailable',
    retention: 'Retained 1 hour after Stop',
    honestNote: 'Tracks recorded token and premium-request totals without fabricating a percentage bar for unexposed plan caps.',
    setupTitle: 'Local integration and usage log watcher',
    setupSourceLabel: 'Settings · Copilot CLI',
    setupDetail: 'Enable Copilot CLI tracking in Halo Settings (backed up with .halo-bak) to monitor local session events and recorded premium-request totals.',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    sourceMethod: 'Opt-in OpenCode plugin event stream',
    sessionTokens: '116,950 tokens',
    sessionCost: '$0.68 reported',
    subscriptionQuota: 'Unavailable (API metered)',
    contextRemaining: '58% context remaining',
    retention: 'Retained 1 hour after Stop',
    honestNote: 'Reports live session tokens, cost, and context budget once the local plugin is enabled in Settings.',
    setupTitle: 'Local OpenCode plugin event stream',
    setupSourceLabel: 'Settings · OpenCode plugin',
    setupDetail: 'Enable the local OpenCode plugin in Halo Settings (reversible via .halo-bak) to stream session lifecycle events, token counts, and context budget.',
  },
];

export function ProvidersStage() {
  const [selectedId, setSelectedId] = useState<ProviderId>('claude-code');
  const [permissionState, setPermissionState] = useState<'pending' | 'approved' | 'denied'>('pending');

  const active = PROVIDERS.find((p) => p.id === selectedId) ?? PROVIDERS[0];

  return (
    <section id="providers" className="studio-section">
      <div className="section-shell">
        <div className="section-header-narrow">
          <h2>Every local coding agent in one calm view</h2>
          <p>
            Halo watches all five supported local coding agents side by side. It separates reported session tokens and
            cost from subscription quota and context, keeps finished sessions visible for one hour, and labels
            unavailable metrics honestly instead of inventing numbers.
          </p>
        </div>

        <div className="asymmetric-stage">
          <div className="provider-selector-list" role="tablist" aria-label="Supported AI coding agents">
            {PROVIDERS.map((provider) => {
              const isSelected = provider.id === active.id;
              return (
                <button
                  key={provider.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`provider-selector-item${isSelected ? ' is-active' : ''}`}
                  onClick={() => setSelectedId(provider.id)}
                >
                  <span className="provider-selector-lead">
                    <ProviderIcon provider={provider.id} size={18} />
                    <span className="provider-selector-name">{provider.name}</span>
                  </span>
                  <span className="provider-selector-meta">{provider.sourceMethod}</span>
                </button>
              );
            })}
          </div>

          <div className="liquid-glass-panel provider-inspector" role="tabpanel" aria-label={`${active.name} telemetry view`}>
            <div className="panel-top-row">
              <div className="panel-identity">
                <ProviderIcon provider={active.id} size={20} />
                <h3>{active.name}</h3>
              </div>
              <span className="tabular panel-retention">{active.retention}</span>
            </div>

            <div className="metric-hairline-grid">
              <div className="metric-row">
                <span className="metric-label">Session tokens</span>
                <span className={`tabular metric-value${active.sessionTokens.startsWith('Unavailable') ? ' is-unavailable' : ''}`}>
                  {active.sessionTokens}
                </span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Session cost</span>
                <span className={`tabular metric-value${active.sessionCost.startsWith('Unavailable') ? ' is-unavailable' : ''}`}>
                  {active.sessionCost}
                </span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Subscription quota</span>
                <span className={`tabular metric-value${active.subscriptionQuota.startsWith('Unavailable') ? ' is-unavailable' : ''}`}>
                  {active.subscriptionQuota}
                </span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Context budget</span>
                <span className={`tabular metric-value${active.contextRemaining.startsWith('Unavailable') ? ' is-unavailable' : ''}`}>
                  {active.contextRemaining}
                </span>
              </div>
            </div>

            <p className="panel-honest-note">{active.honestNote}</p>

            <div className="permission-divider" />

            {active.hasPermissionPreview ? (
              <div className="permission-preview">
                <div className="permission-head">
                  <span className="permission-title-wrap">
                    <ShieldAlert size={16} className="tone-amber" aria-hidden="true" />
                    <span className="permission-title">Claude Code permission prompt</span>
                  </span>
                  {permissionState !== 'pending' && (
                    <button
                      type="button"
                      className="permission-reset"
                      onClick={() => setPermissionState('pending')}
                    >
                      <RotateCcw size={13} aria-hidden="true" />
                      Reset
                    </button>
                  )}
                </div>

                <div className="permission-command">
                  Bash · npm test -- src/lib/agentEvents.test.ts
                </div>

                {permissionState === 'pending' ? (
                  <div className="permission-actions">
                    <button
                      type="button"
                      className="perm-btn perm-btn--approve"
                      onClick={() => setPermissionState('approved')}
                    >
                      <Check size={14} aria-hidden="true" />
                      Approve from Halo
                    </button>
                    <button
                      type="button"
                      className="perm-btn perm-btn--deny"
                      onClick={() => setPermissionState('denied')}
                    >
                      <X size={14} aria-hidden="true" />
                      Deny
                    </button>
                  </div>
                ) : (
                  <div className={`permission-result permission-result--${permissionState}`}>
                    {permissionState === 'approved'
                      ? 'Approved locally. Claude Code resumed execution without switching windows.'
                      : 'Denied locally. Execution halted and logged to your local event stream.'}
                  </div>
                )}
              </div>
            ) : (
              <div className="permission-preview">
                <div className="permission-head">
                  <span className="permission-title-wrap">
                    <Terminal size={16} className="tone-blue" aria-hidden="true" />
                    <span className="permission-title">{active.setupTitle}</span>
                  </span>
                  <span className="tabular panel-retention">{active.setupSourceLabel}</span>
                </div>
                <div className="provider-source-detail">{active.setupDetail}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
