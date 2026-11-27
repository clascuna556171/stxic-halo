import { Bot } from 'lucide-react';
import { siClaudecode, siGithubcopilot, siOpencode } from 'simple-icons';
import antigravityIcon from '../assets/antigravity-icon.png';
import codexIcon from '../assets/codex-icon.png';
import type { Provider } from '../types';

const paths: Partial<Record<Provider, string>> = {
  'claude-code': siClaudecode.path,
  'github-copilot': siGithubcopilot.path,
  opencode: siOpencode.path,
};

/** Decorative marks always accompany a visible provider name. */
export function ProviderIcon({ provider }: { provider: Provider }) {
  const path = paths[provider];
  return <span className={`provider-icon provider-icon--${provider}`} aria-hidden="true">
    {path ? <svg viewBox="0 0 24 24" focusable="false"><path d={path} fill="currentColor" /></svg>
      : provider === 'codex' ? (
        <img src={codexIcon} alt="" className="provider-icon-img" draggable={false} />
      )
      : provider === 'antigravity' ? (
        <img src={antigravityIcon} alt="" className="provider-icon-img" draggable={false} />
      )
      : <Bot size={15} />}
  </span>;
}
