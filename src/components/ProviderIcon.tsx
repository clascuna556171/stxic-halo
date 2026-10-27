import { Bot } from 'lucide-react';
import { siClaudecode, siGithubcopilot, siOpencode } from 'simple-icons';
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
      : provider === 'codex' ? <span>C</span>
      : provider === 'antigravity' ? <span>A</span>
      : <Bot size={15} />}
  </span>;
}
