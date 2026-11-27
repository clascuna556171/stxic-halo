import { useState } from 'react';
import { Activity, Cpu, ShieldCheck } from 'lucide-react';
import HaloMark from './HaloMark';
import { ProviderIcon, type ProviderId } from './ProviderIcon';

export type HudMode = 'collapsed' | 'hover' | 'expanded';
type ExpandedTab = 'overview' | 'activity' | 'health';

const RING_RADIUS = 10;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function QuotaRing({
  provider,
  percent,
  tone,
}: {
  provider: ProviderId;
  percent: number;
  tone: 'green' | 'amber' | 'blue';
}) {
  const dashOffset = RING_CIRCUMFERENCE * (1 - percent / 100);
  return (
    <span className="hud-ring-group">
      <span className="hud-ring-gauge">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <circle className="hud-ring-track" cx="12" cy="12" r={RING_RADIUS} strokeWidth="2.1" fill="none" />
          <circle
            className={`hud-ring-arc hud-ring-arc--${tone}`}
            cx="12"
            cy="12"
            r={RING_RADIUS}
            strokeWidth="2.1"
            fill="none"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform="rotate(-90 12 12)"
          />
        </svg>
        <span className="hud-ring-icon">
          <ProviderIcon provider={provider} size={11} />
        </span>
      </span>
      <span className="tabular hud-ring-num">{percent}%</span>
    </span>
  );
}

export function HeroHudPreview() {
  const [mode, setMode] = useState<HudMode>('hover');
  const [tab, setTab] = useState<ExpandedTab>('overview');

  return (
    <div className="hero-hud-stage">
      <div className="hero-stage-toolbar">
        <div className="segmented-control" role="tablist" aria-label="Halo HUD window states">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'collapsed'}
            className={`segmented-option${mode === 'collapsed' ? ' is-active' : ''}`}
            onClick={() => setMode('collapsed')}
          >
            Collapsed notch (340×38)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'hover'}
            className={`segmented-option${mode === 'hover' ? ' is-active' : ''}`}
            onClick={() => setMode('hover')}
          >
            Hover preview (340×112)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'expanded'}
            className={`segmented-option${mode === 'expanded' ? ' is-active' : ''}`}
            onClick={() => setMode('expanded')}
          >
            Expanded HUD (460×564)
          </button>
        </div>
      </div>

      {/* Product-Native Windows 11 Top-Bezel Desktop Stage */}
      <div className={`desktop-stage desktop-stage--${mode}`} aria-label="Windows 11 top-bezel HUD preview">
        {/* Top-Bezel Docked STXIC Halo Liquid Glass HUD */}
        <div className="desktop-bezel-dock">
          {mode === 'collapsed' && (
            <div className="liquid-glass-hud hud-collapsed hud-docked" role="region" aria-label="Collapsed notch preview">
              <QuotaRing provider="claude-code" percent={78} tone="green" />
              <span className="hud-center-status">
                <HaloMark size={16} cutoutColor="#12141b" />
                <span className="hud-dot hud-dot--green" aria-hidden="true" />
                <span className="hud-inline-text">2 active</span>
              </span>
              <QuotaRing provider="codex" percent={64} tone="blue" />
            </div>
          )}

          {mode === 'hover' && (
            <div className="liquid-glass-hud hud-hover hud-docked" role="region" aria-label="Hover preview capsule">
              <div className="hud-hover-top">
                <QuotaRing provider="claude-code" percent={78} tone="green" />
                <span className="hud-center-status">
                  <HaloMark size={16} cutoutColor="#12141b" />
                  <span className="hud-dot hud-dot--green" aria-hidden="true" />
                  <span className="hud-inline-text">Claude Code · Running</span>
                </span>
                <QuotaRing provider="codex" percent={64} tone="blue" />
              </div>
              <div className="hud-hover-divider" />
              <div className="hud-hover-body">
                <div className="hud-hover-row">
                  <span className="hud-strong-line">5h quota 78% left · 1w quota 84% left</span>
                  <span className="tabular hud-dim-line">187k tokens</span>
                </div>
                <div className="hud-hover-row">
                  <span className="hud-dim-line">Tool: Edit · src/lib/agentEvents.ts</span>
                  <span className="tabular hud-dim-line">CPU 19% · RAM 54%</span>
                </div>
              </div>
            </div>
          )}

          {mode === 'expanded' && (
            <div className="liquid-glass-hud hud-expanded hud-docked" role="region" aria-label="Expanded HUD console">
              <div className="hud-expanded-header">
                <span className="hud-brand-lockup">
                  <HaloMark size={18} cutoutColor="#12141b" />
                  <span className="hud-brand-name">STXIC Halo</span>
                </span>
                <div className="hud-tab-strip" role="tablist" aria-label="Expanded HUD views">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'overview'}
                    className={`hud-tab-btn${tab === 'overview' ? ' is-active' : ''}`}
                    onClick={() => setTab('overview')}
                  >
                    Overview
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'activity'}
                    className={`hud-tab-btn${tab === 'activity' ? ' is-active' : ''}`}
                    onClick={() => setTab('activity')}
                  >
                    Activity
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'health'}
                    className={`hud-tab-btn${tab === 'health' ? ' is-active' : ''}`}
                    onClick={() => setTab('health')}
                  >
                    Health
                  </button>
                </div>
              </div>

              {tab === 'overview' && (
                <div className="hud-expanded-body">
                  <div className="hud-section-block">
                    <div className="hud-block-head">
                      <span>Usage and limits</span>
                      <span className="tabular hud-dim-line">5 providers</span>
                    </div>
                    <div className="hud-quota-list">
                      <div className="hud-quota-row">
                        <span className="hud-provider-cell">
                          <ProviderIcon provider="claude-code" size={15} />
                          <span>Claude Code</span>
                        </span>
                        <span className="tabular hud-metric-value">78% 5h left · 187k tokens</span>
                      </div>
                      <div className="hud-quota-row">
                        <span className="hud-provider-cell">
                          <ProviderIcon provider="codex" size={15} />
                          <span>Codex</span>
                        </span>
                        <span className="tabular hud-metric-value">64% 5h left · 92k tokens</span>
                      </div>
                      <div className="hud-quota-row">
                        <span className="hud-provider-cell">
                          <ProviderIcon provider="antigravity" size={15} />
                          <span>Antigravity</span>
                        </span>
                        <span className="tabular hud-metric-value">81% quota left</span>
                      </div>
                    </div>
                  </div>

                  <div className="hud-section-block">
                    <div className="hud-block-head">
                      <span>Active sessions</span>
                      <span className="tabular hud-dim-line">2 running</span>
                    </div>
                    <div className="hud-session-row">
                      <div>
                        <div className="hud-session-title">
                          <span className="hud-dot hud-dot--green" aria-hidden="true" />
                          <span>Claude Code · stxic-halo</span>
                        </div>
                        <div className="hud-dim-line">Running vitest on agentEvents.test.ts</div>
                      </div>
                      <span className="tabular hud-dim-line">4m 12s</span>
                    </div>
                    <div className="hud-session-row">
                      <div>
                        <div className="hud-session-title">
                          <span className="hud-dot hud-dot--blue" aria-hidden="true" />
                          <span>Codex · api-gateway</span>
                        </div>
                        <div className="hud-dim-line">Completed · retained for 54m</div>
                      </div>
                      <span className="tabular hud-dim-line">92k tok</span>
                    </div>
                  </div>

                  <div className="hud-section-block hud-meters">
                    <div className="hud-meter-item">
                      <div className="hud-meter-head">
                        <span>Host CPU</span>
                        <span className="tabular">19%</span>
                      </div>
                      <div className="hud-bar-track">
                        <div className="hud-bar-fill hud-bar-fill--green" style={{ width: '19%' }} />
                      </div>
                    </div>
                    <div className="hud-meter-item">
                      <div className="hud-meter-head">
                        <span>Host RAM</span>
                        <span className="tabular">17.3 / 32 GB (54%)</span>
                      </div>
                      <div className="hud-bar-track">
                        <div className="hud-bar-fill hud-bar-fill--blue" style={{ width: '54%' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'activity' && (
                <div className="hud-expanded-body">
                  <div className="hud-section-block">
                    <div className="hud-block-head">
                      <span>Recent lifecycle events</span>
                      <Activity size={14} aria-hidden="true" />
                    </div>
                    <div className="hud-session-row">
                      <div>
                        <div className="hud-session-title">
                          <span className="hud-dot hud-dot--green" aria-hidden="true" />
                          <span>PreToolUse · Bash</span>
                        </div>
                        <div className="hud-dim-line">Claude Code · npm test -- agentEvents</div>
                      </div>
                      <span className="tabular hud-dim-line">12s ago</span>
                    </div>
                    <div className="hud-session-row">
                      <div>
                        <div className="hud-session-title">
                          <span className="hud-dot hud-dot--amber" aria-hidden="true" />
                          <span>Collision guard · 1 shared file</span>
                        </div>
                        <div className="hud-dim-line">src/lib/sessionReconciliation.ts</div>
                      </div>
                      <span className="tabular hud-dim-line">2m ago</span>
                    </div>
                    <div className="hud-session-row">
                      <div>
                        <div className="hud-session-title">
                          <span className="hud-dot hud-dot--blue" aria-hidden="true" />
                          <span>Stop · Verified by vitest</span>
                        </div>
                        <div className="hud-dim-line">Codex · 125 passed, 0 failed</div>
                      </div>
                      <span className="tabular hud-dim-line">6m ago</span>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'health' && (
                <div className="hud-expanded-body">
                  <div className="hud-section-block">
                    <div className="hud-block-head">
                      <span>Host and hook health</span>
                      <Cpu size={14} aria-hidden="true" />
                    </div>
                    <div className="hud-quota-list">
                      <div className="hud-quota-row">
                        <span>Local event log</span>
                        <span className="tabular hud-status-green">Healthy · 148 KiB / 2 MiB</span>
                      </div>
                      <div className="hud-quota-row">
                        <span>Idle memory drift</span>
                        <span className="tabular hud-status-green">Stable · +2 MB/hr</span>
                      </div>
                      <div className="hud-quota-row">
                        <span>Outbound network</span>
                        <span className="hud-status-green">
                          <ShieldCheck size={14} aria-hidden="true" className="hud-inline-icon" /> Blocked by CSP
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quiet Sunlit Windows Developer Workspace Beneath the Top-Edge HUD */}
        <div className="workspace-backdrop" aria-hidden="true">
          <div className="workspace-titlebar">
            <span className="workspace-file-tab is-active">agentEvents.ts</span>
            <span className="workspace-file-tab">sessionReconciliation.ts</span>
            <span className="workspace-file-tab">window.rs</span>
          </div>
          <div className="workspace-panes">
            <div className="workspace-sidebar">
              <div className="workspace-tree-item is-current">src/lib/agentEvents.ts</div>
              <div className="workspace-tree-item">src/lib/proofOfWork.ts</div>
              <div className="workspace-tree-item">src/lib/telemetryHistory.ts</div>
              <div className="workspace-tree-item">src-tauri/src/window.rs</div>
              <div className="workspace-tree-item">src-tauri/src/events.rs</div>
            </div>
            <div className="workspace-editor">
              <div className="code-line"><span className="code-ln tabular">41</span><span>export function reconcileSessionEvents(tail: RawEvent[]) &#123;</span></div>
              <div className="code-line"><span className="code-ln tabular">42</span><span>  const active = new Map&lt;string, AgentSession&gt;();</span></div>
              <div className="code-line is-highlight"><span className="code-ln tabular">43</span><span>  for (const ev of tail) detectIntersectingEdits(active, ev);</span></div>
              <div className="code-line"><span className="code-ln tabular">44</span><span>  return retainCompletedForOneHour(active, Date.now());</span></div>
              <div className="code-line"><span className="code-ln tabular">45</span><span>&#125;</span></div>
              <div className="workspace-terminal">
                <div className="terminal-line"><span className="terminal-prompt">PS stxic-halo&gt;</span> vitest run src/lib/agentEvents.test.ts</div>
                <div className="terminal-line terminal-pass">✓ 22 test files passed (125 tests) · 2.41s</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
