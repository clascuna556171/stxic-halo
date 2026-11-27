import { siClaudecode, siGithubcopilot, siOpencode } from 'simple-icons';
import antigravityIcon from '../assets/antigravity-icon.png';
import codexIcon from '../assets/codex-icon.png';

export type ProviderId = 'claude-code' | 'antigravity' | 'codex' | 'github-copilot' | 'opencode';

const ICON_PATHS: Partial<Record<ProviderId, string>> = {
  'claude-code': siClaudecode.path,
  'github-copilot': siGithubcopilot.path,
  opencode: siOpencode.path,
};

export function ProviderIcon({ provider, size = 16 }: { provider: ProviderId; size?: number }) {
  const path = ICON_PATHS[provider];

  if (provider === 'antigravity') {
    return (
      <span className="provider-glyph provider-glyph--antigravity" aria-hidden="true">
        <img src={antigravityIcon} alt="" width={size} height={size} draggable={false} />
      </span>
    );
  }

  if (provider === 'codex') {
    return (
      <span className="provider-glyph provider-glyph--codex" aria-hidden="true">
        <img src={codexIcon} alt="" width={size} height={size} draggable={false} />
      </span>
    );
  }

  return (
    <span className={`provider-glyph provider-glyph--${provider}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size} height={size} focusable="false">
        <path d={path} fill="currentColor" />
      </svg>
    </span>
  );
}
