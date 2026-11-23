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
      : provider === 'codex' ? (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M12 2.5L20 7.1v9.8L12 21.5 4 16.9V7.1L12 2.5zm0 2.6L6.3 8.4v7.2L12 18.9l5.7-3.3V8.4L12 5.1zm-1.1 3.7L8.5 12l2.4 3.2-1.4 1.1L6.2 12l3.3-4.3 1.4 1.1zm2.2 0l1.4-1.1L17.8 12l-3.3 4.3-1.4-1.1 2.4-3.2-2.4-3.2z" fill="currentColor" />
        </svg>
      )
      : provider === 'antigravity' ? (
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M12 3L4.5 20h3.3l1.6-3.8h5.2l1.6 3.8h3.3L12 3zm0 5.4l1.7 4.4h-3.4L12 8.4z" fill="currentColor" />
        </svg>
      )
      : <Bot size={15} />}
  </span>;
}
