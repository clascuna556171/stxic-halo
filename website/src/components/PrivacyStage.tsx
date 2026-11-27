import { ArrowUpRight } from 'lucide-react';

const STORE_URL = 'https://apps.microsoft.com/detail/9NSGFN7JZWPH';

const GUARANTEES = [
  {
    title: 'Zero cloud backend or telemetry',
    body: 'Halo enforces a strict local-only Content Security Policy (connect-src ipc: http://ipc.localhost) with no outbound network requests and no analytics.',
  },
  {
    title: 'No prompt or transcript capture',
    body: 'Lifecycle hooks record only schema version, provider source, session ID, timestamp, event type, working directory, and tool name.',
  },
  {
    title: 'Automatic rollback backups',
    body: 'One-click provider hook setup writes a .halo-bak backup beside your existing configuration so every change is reversible.',
  },
  {
    title: 'Sanitized diagnostic exports',
    body: 'When you export diagnostics to file a bug report, local user paths and identifiers are scrubbed before anything leaves your disk.',
  },
] as const;

export function PrivacyStage() {
  return (
    <section id="privacy" className="studio-section studio-section--closing">
      <div className="section-shell">
        <div className="privacy-glass-sheet">
          <div className="privacy-lead">
            <h2>Local by design, with nothing leaving your machine</h2>
            <p>
              STXIC Halo runs entirely on Windows 10 and 11 as a signed Microsoft Store app. Your code, prompts, and
              session logs stay on your workstation.
            </p>
          </div>

          <div className="privacy-grid">
            {GUARANTEES.map((item) => (
              <div key={item.title} className="privacy-item">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>

          <div className="privacy-cta-row">
            <a
              href={STORE_URL}
              target="_blank"
              rel="noreferrer"
              className="primary-pill-cta"
            >
              Download free on Microsoft Store
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
            <p className="privacy-footnote">
              Windows 10 and 11 (x64) · Version 0.1.1 · Free on Microsoft Store (9NSGFN7JZWPH)
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
