import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import HaloMark from './components/HaloMark';
import { HeroHudPreview } from './components/HeroHudPreview';
import { ProvidersStage } from './components/ProvidersStage';
import { ProofOfWorkStage } from './components/ProofOfWorkStage';
import { TelemetryErgonomics } from './components/TelemetryErgonomics';
import { TrailerStage } from './components/TrailerStage';
import { PrivacyStage } from './components/PrivacyStage';

const STORE_URL = 'https://apps.microsoft.com/detail/9NSGFN7JZWPH';
const PRIVACY_URL = 'https://github.com/clascuna556171/stxic-halo/blob/main/docs/release/PRIVACY_POLICY_DRAFT.md';
const GITHUB_URL = 'https://github.com/clascuna556171/stxic-halo';

export default function App() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="studio-page">
      <header className={`site-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="header-inner">
          <a href="#overview" className="brand-wordmark" aria-label="STXIC Halo home">
            <HaloMark size={24} cutoutColor={scrolled ? '#FAF8F5' : '#F4F1EC'} />
            <span>STXIC Halo</span>
          </a>

          <nav className="site-nav" aria-label="Primary navigation">
            <a href="#overview">Overview</a>
            <a href="#providers">Providers</a>
            <a href="#proof-of-work">Proof of Work</a>
            <a href="#privacy">Privacy</a>
          </nav>

          <a
            href={STORE_URL}
            target="_blank"
            rel="noreferrer"
            className="header-cta"
          >
            Get Halo
          </a>
        </div>
      </header>

      <main>
        <section id="overview" className="hero-stage">
          <div className="hero-studio-field" aria-hidden="true">
            <div className="hero-light-arc" />
            <div className="hero-grid-overlay" />
          </div>

          <div className="hero-content-shell">
            <div className="hero-monumental-head">
              <h1>Stay in flow. Halo keeps watch.</h1>
              <div className="hero-horizon-bar">
                <p className="hero-subtitle">
                  A quiet, local-first Windows HUD for AI coding agents, proof of work, and system health.
                </p>
                <a
                  href={STORE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="primary-pill-cta"
                >
                  Get on Microsoft Store
                  <ArrowUpRight size={17} aria-hidden="true" />
                </a>
              </div>
            </div>

            <HeroHudPreview />
          </div>
        </section>

        <ProvidersStage />
        <ProofOfWorkStage />
        <TelemetryErgonomics />
        <TrailerStage />
        <PrivacyStage />
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <HaloMark size={18} cutoutColor="#F4F1EC" />
            <span>STXIC Halo v0.1.1 for Windows 10 and 11</span>
          </div>
          <div className="footer-links">
            <a href={STORE_URL} target="_blank" rel="noreferrer">
              Microsoft Store
            </a>
            <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
              Privacy Policy
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
