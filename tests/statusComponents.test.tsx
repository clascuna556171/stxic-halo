import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Agent, ClaudeHookStatus } from '../src/types';

// These components only read `isDesktop()` during a static render (effects do not run),
// so the desktop flag is the single thing worth controlling.
const desktop = vi.hoisted(() => ({ value: false }));
vi.mock('../src/lib/desktop', () => ({
  isDesktop: () => desktop.value,
  readProviderConnections: async () => [],
  setProviderConnection: async () => { throw new Error('not used in static render'); },
}));

import { ConnectionHealth } from '../src/components/ConnectionHealth';
import { ProviderConnections } from '../src/components/ProviderConnections';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

const agent = (patch: Partial<Agent>): Agent => ({
  id: 'a1', provider: 'codex', name: 'Codex', task: 'task', workspace: 'alpha', status: 'working',
  contextPercent: null, tokenUsage: null, lastSeen: new Date().toISOString(), proof: null, isDemo: false, ...patch,
});
const hook = (installed: boolean): ClaudeHookStatus => ({
  success: true, installed, hook_count: installed ? 1 : 0, config_path: 'c', hook_path: 'h',
  backup_exists: false, backup_path: 'b', message: '',
});

afterEach(() => { desktop.value = false; });

describe('ConnectionHealth', () => {
  it('says a desktop app is required outside the desktop shell, without implying a failure', () => {
    const html = renderToStaticMarkup(<ConnectionHealth agents={[]} codexLogsEnabled claudeHookStatus={hook(true)} />);
    expect(html).toContain('Desktop app required');
    expect(html).not.toContain('Bridge configured');
  });

  it('reports configuration per provider and leaves unread bridges as unknown rather than guessing', () => {
    desktop.value = true;
    const html = renderToStaticMarkup(<ConnectionHealth agents={[]} codexLogsEnabled={false} claudeHookStatus={hook(true)} />);
    expect(html).toContain('Log adapter off');
    expect(html).toContain('Bridge configured');
    expect(html.match(/Configuration unknown/g)).toHaveLength(3);
  });

  it('uses the newest real session for last activity and ignores demo sessions', () => {
    desktop.value = true;
    const old = agent({ id: 'old', lastSeen: new Date(Date.now() - 3 * 3600_000).toISOString() });
    const fresh = agent({ id: 'new', lastSeen: new Date().toISOString() });
    const demo = agent({ id: 'demo', provider: 'claude-code', isDemo: true });
    const html = renderToStaticMarkup(<ConnectionHealth agents={[old, fresh, demo]} codexLogsEnabled claudeHookStatus={hook(false)} />);
    expect(html).toContain('Last activity Just now');
    expect(html).not.toContain('Last activity 3h ago');
    expect(html).toContain('Setup needed');
    expect(html.match(/No activity observed/g)).toHaveLength(4); // every provider except codex
  });
});

describe('ProviderConnections', () => {
  it('disables Connect until the desktop app has loaded real configuration', () => {
    const html = renderToStaticMarkup(<ProviderConnections />);
    expect(html).toContain('Open the desktop app to connect providers.');
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Connect OpenCode"');
    expect(html).toContain('Not connected');
  });

  it('keeps Connect disabled on desktop until connections have loaded', () => {
    desktop.value = true;
    const html = renderToStaticMarkup(<ProviderConnections />);
    expect(html).not.toContain('Open the desktop app');
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
});

describe('ErrorBoundary', () => {
  it('turns a thrown Error into a readable recovery state instead of a blank HUD', () => {
    const state = ErrorBoundary.getDerivedStateFromError(new Error('boom'));
    expect(state).toEqual({ hasError: true, message: 'boom' });
    expect(ErrorBoundary.getDerivedStateFromError('plain text')).toEqual({ hasError: true, message: 'plain text' });
  });

  it('renders children normally and the reset banner after a fault', () => {
    const boundary = new ErrorBoundary({ children: 'child' });
    expect(boundary.render()).toBe('child');
    boundary.state = ErrorBoundary.getDerivedStateFromError(new Error('boom'));
    const html = renderToStaticMarkup(<>{boundary.render()}</>);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Console render fault recovered');
    expect(html).toContain('boom');
    expect(html).toContain('Reset HUD');
  });

  it('shows a fallback message when the error has no text', () => {
    const boundary = new ErrorBoundary({ children: null });
    boundary.state = { hasError: true, message: '' };
    expect(renderToStaticMarkup(<>{boundary.render()}</>)).toContain('Unexpected UI state');
  });
});
