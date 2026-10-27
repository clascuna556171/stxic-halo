import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActivityView } from '../src/components/ActivityView';
import type { AgentEvent } from '../src/types';

const event = (patch: Partial<AgentEvent> = {}): AgentEvent => ({ schema_version: 1, source: 'codex',
  session_id: 'one', timestamp: '2026-10-26T10:00:00Z', event: 'SessionStart', cwd: 'C:\\work\\alpha', ...patch });
const render = (events: AgentEvent[]) => renderToStaticMarkup(<ActivityView agents={[]} events={events} demo={false}
  approvedWorkspaces={[]} checks={{}} onVerifyWorkspace={async () => null} onWorkspaceSettings={() => {}} />);

describe('Activity view', () => {
  it('starts with activity across projects, newest first, and calls out errors and approvals', () => {
    const html = render([event(), event({ session_id: 'two', source: 'claude-code', cwd: 'D:\\work\\beta',
      timestamp: '2026-10-26T11:00:00Z', event: 'PermissionRequest' }), event({ event: 'Error' })]);
    expect(html.indexOf('Waiting for your approval')).toBeLessThan(html.indexOf('Session started'));
    expect(html).toContain('beta');
    expect(html).toContain('alpha');
    expect(html.match(/Needs attention/g)).toHaveLength(2);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('All providers');
    expect(html).toContain('Files &amp; tests');
    expect(html).toContain('Choose a project');
    expect(html).not.toContain('tests passed');
  });
  it('explains the empty state and leaves checks optional', () => {
    const html = render([]);
    expect(html).toContain('No activity yet');
    expect(html).toContain('Projects appear here after an agent reports activity.');
    expect(html).toContain('Optional checks');
  });
});
