import { useState } from 'react';
import { Keyboard, Monitor } from 'lucide-react';
import HaloMark from './HaloMark';

const SHORTCUTS = [
  { keys: 'Alt + H', action: 'Toggle Halo HUD visibility' },
  { keys: 'Alt + 1..4', action: 'Switch Overview, Activity, Health, Settings' },
  { keys: 'Esc', action: 'Collapse back to the top bezel' },
] as const;

export function TelemetryErgonomics() {
  const [peeking, setPeeking] = useState(false);
  const [activeDisplay, setActiveDisplay] = useState<'primary' | 'secondary'>('primary');

  return (
    <section id="telemetry" className="studio-section">
      <div className="section-shell">
        <div className="ergonomics-grid">
          <div className="ergonomics-visual-col">
            {/* Product-Native Multi-Monitor DPI Clamping Interactive Stage */}
            <div className="monitor-stage">
              <div className="monitor-stage-head">
                <span className="monitor-stage-title">Active display docking</span>
                <div className="segmented-control segmented-control--compact" role="tablist" aria-label="Select monitor">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeDisplay === 'primary'}
                    className={`segmented-option${activeDisplay === 'primary' ? ' is-active' : ''}`}
                    onClick={() => setActiveDisplay('primary')}
                  >
                    Display 1 · 125% DPI
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeDisplay === 'secondary'}
                    className={`segmented-option${activeDisplay === 'secondary' ? ' is-active' : ''}`}
                    onClick={() => setActiveDisplay('secondary')}
                  >
                    Display 2 · 100% DPI
                  </button>
                </div>
              </div>

              <div className="monitor-pair">
                <div
                  className={`monitor-frame monitor-frame--primary${activeDisplay === 'primary' ? ' is-active' : ''}`}
                  onClick={() => setActiveDisplay('primary')}
                >
                  {activeDisplay === 'primary' && (
                    <div className="monitor-hud-capsule">
                      <span className="hud-dot hud-dot--green" aria-hidden="true" />
                      <span className="tabular">78% · 2 active</span>
                    </div>
                  )}
                  <span className="monitor-spec tabular">2560 × 1440 · 125% scale</span>
                </div>

                <div
                  className={`monitor-frame monitor-frame--secondary${activeDisplay === 'secondary' ? ' is-active' : ''}`}
                  onClick={() => setActiveDisplay('secondary')}
                >
                  {activeDisplay === 'secondary' && (
                    <div className="monitor-hud-capsule">
                      <span className="hud-dot hud-dot--green" aria-hidden="true" />
                      <span className="tabular">78% · 2 active</span>
                    </div>
                  )}
                  <span className="monitor-spec tabular">1920 × 1080 · 100% scale</span>
                </div>
              </div>
            </div>

            <div
              className="peek-demo-surface"
              onMouseEnter={() => setPeeking(true)}
              onMouseLeave={() => setPeeking(false)}
              onFocus={() => setPeeking(true)}
              onBlur={() => setPeeking(false)}
              tabIndex={0}
              role="region"
              aria-label="Interactive auto-hide peek bar demonstration"
            >
              <div className={`peek-bar-sim${peeking ? ' is-revealed' : ''}`}>
                {peeking ? (
                  <span className="peek-revealed-content">
                    <HaloMark size={15} cutoutColor="#12141b" />
                    <span className="hud-dot hud-dot--green" aria-hidden="true" />
                    <span>Claude Code · 78% left</span>
                    <span className="tabular hud-dim-line">CPU 19%</span>
                  </span>
                ) : (
                  <span className="peek-sliver" aria-hidden="true" />
                )}
              </div>
              <p className="peek-caption">
                Hover or focus to expand the 120×5 auto-hide peek bar into the full top-bezel notch.
              </p>
            </div>
          </div>

          <div className="ergonomics-copy-col">
            <h2>Hardware telemetry that stays out of your way</h2>
            <p>
              Built in Rust and Tauri 2 for low idle overhead. Halo samples CPU and RAM pressure on device, flags idle
              memory leak drift when background processes climb, and clamps cleanly across multi-monitor DPI layouts.
            </p>

            <div className="telemetry-readout-block">
              <div className="telemetry-bar-group">
                <div className="telemetry-bar-head">
                  <span>CPU pressure</span>
                  <span className="tabular">19% · 142 processes</span>
                </div>
                <div className="studio-meter-track">
                  <div className="studio-meter-fill studio-meter-fill--green" style={{ width: '19%' }} />
                </div>
              </div>

              <div className="telemetry-bar-group">
                <div className="telemetry-bar-head">
                  <span>Memory pressure</span>
                  <span className="tabular">17.3 / 32 GB (54%)</span>
                </div>
                <div className="studio-meter-track">
                  <div className="studio-meter-fill studio-meter-fill--blue" style={{ width: '54%' }} />
                </div>
              </div>

              <div className="telemetry-drift-row">
                <span className="hud-dot hud-dot--amber" aria-hidden="true" />
                <span>Idle leak detector watches background growth (+142 MB/hr drift threshold)</span>
              </div>
            </div>

            <div className="ergonomics-specs">
              <div className="ergonomics-spec-row">
                <Monitor size={18} className="spec-icon" aria-hidden="true" />
                <div>
                  <h3>Multi-monitor DPI clamping</h3>
                  <p>
                    Snaps cleanly to the top center of your active monitor with automatic off-screen bounds clamping
                    and tray recovery.
                  </p>
                </div>
              </div>

              <div className="ergonomics-spec-row">
                <Keyboard size={18} className="spec-icon" aria-hidden="true" />
                <div>
                  <h3>Keyboard-first control</h3>
                  <ul className="shortcut-list">
                    {SHORTCUTS.map((item) => (
                      <li key={item.keys}>
                        <kbd className="studio-kbd">{item.keys}</kbd>
                        <span>{item.action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
