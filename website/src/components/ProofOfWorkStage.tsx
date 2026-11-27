import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileDiff, Terminal } from 'lucide-react';

type ProofTab = 'diff' | 'collision' | 'tests';

const DIFF_ROWS = [
  { status: 'Staged', file: 'src/lib/agentEvents.ts', delta: '+42 -11', tone: 'green' },
  { status: 'Modified', file: 'src/lib/sessionReconciliation.ts', delta: '+18 -6', tone: 'amber' },
  { status: 'Modified', file: 'src/styles.css', delta: '+29 -4', tone: 'amber' },
  { status: 'Untracked', file: 'tests/collisionGuard.test.ts', delta: '+84 -0', tone: 'blue' },
] as const;

const TEST_RUNS = [
  { runner: 'vitest run', scope: '22 files · 125 tests', duration: '2.4s', result: 'Passed' },
  { runner: 'cargo test --lib', scope: 'src-tauri · 58 unit tests', duration: '4.1s', result: 'Passed' },
  { runner: 'pytest -q', scope: 'Opt-in Python repo verifier', duration: '1.8s', result: 'Ready' },
] as const;

export function ProofOfWorkStage() {
  const [activeTab, setActiveTab] = useState<ProofTab>('diff');

  return (
    <section id="proof-of-work" className="studio-section studio-section--tinted">
      <div className="section-shell">
        <div className="proof-layout">
          <div className="proof-copy">
            <h2>Verify what changed before you trust a stop</h2>
            <p>
              An agent finishing a turn is not proof the build still works. Halo inspects your local Git working tree,
              warns immediately when two active sessions touch the same file, and runs opt-in test verifiers on demand.
            </p>

            <div className="segmented-control segmented-control--left" role="tablist" aria-label="Proof of work modes">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'diff'}
                className={`segmented-option${activeTab === 'diff' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('diff')}
              >
                Git diff breakdown
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'collision'}
                className={`segmented-option${activeTab === 'collision' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('collision')}
              >
                Collision guard
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'tests'}
                className={`segmented-option${activeTab === 'tests' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('tests')}
              >
                Test verification
              </button>
            </div>
          </div>

          <div className="liquid-glass-panel proof-inspector" role="tabpanel">
            {activeTab === 'diff' && (
              <>
                <div className="panel-top-row">
                  <div className="panel-identity">
                    <FileDiff size={18} className="tone-blue" aria-hidden="true" />
                    <h3>Working tree summary</h3>
                  </div>
                  <span className="tabular panel-retention">4 files · +173 -21</span>
                </div>
                <div className="metric-hairline-grid">
                  {DIFF_ROWS.map((row) => (
                    <div key={row.file} className="diff-row">
                      <span className={`diff-state diff-state--${row.tone}`}>{row.status}</span>
                      <span className="diff-path">{row.file}</span>
                      <span className="tabular diff-delta">{row.delta}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {activeTab === 'collision' && (
              <>
                <div className="panel-top-row">
                  <div className="panel-identity">
                    <AlertTriangle size={18} className="tone-amber" aria-hidden="true" />
                    <h3>Intersecting file edit detected</h3>
                  </div>
                  <span className="tabular tone-amber">2 sessions</span>
                </div>
                <div className="collision-detail">
                  <div className="collision-file">src/lib/sessionReconciliation.ts</div>
                  <p className="panel-honest-note">
                    Both Claude Code and Codex wrote to this path within the last 90 seconds. Halo surfaces the
                    overlap in the top notch before either session overwrites the other.
                  </p>
                  <div className="metric-hairline-grid">
                    <div className="metric-row">
                      <span className="metric-label">Claude Code · session a49f</span>
                      <span className="tabular metric-value">Edited lines 84 to 112</span>
                    </div>
                    <div className="metric-row">
                      <span className="metric-label">Codex · session c812</span>
                      <span className="tabular metric-value">Edited lines 92 to 124</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'tests' && (
              <>
                <div className="panel-top-row">
                  <div className="panel-identity">
                    <Terminal size={18} className="tone-green" aria-hidden="true" />
                    <h3>Opt-in proof of work</h3>
                  </div>
                  <span className="tabular tone-green">Verified</span>
                </div>
                <div className="metric-hairline-grid">
                  {TEST_RUNS.map((run) => (
                    <div key={run.runner} className="test-row">
                      <div>
                        <div className="test-runner">{run.runner}</div>
                        <div className="hud-dim-line">{run.scope}</div>
                      </div>
                      <div className="test-status">
                        <CheckCircle2 size={15} className="tone-green" aria-hidden="true" />
                        <span className="tabular">{run.result} · {run.duration}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
