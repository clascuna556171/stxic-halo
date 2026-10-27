import { describe, expect, it } from 'vitest';
import {
  areAgentsEqual,
  areEventsEqual,
  areMetricsEqual,
  areProcessLifecyclesEqual,
  areUsageResultsEqual,
} from '../src/hooks/useHaloRuntime';
import type { Agent, AgentEvent, Metrics, ProcessLifecycleSnapshot, UsageReadResult } from '../src/types';

describe('runtimeOptimization equality guards', () => {
  it('areMetricsEqual compares metrics values with epsilon for cpu jitter', () => {
    const base: Metrics = {
      cpu_percent: 12.4,
      memory_used_bytes: 4000000,
      memory_total_bytes: 16000000,
      process_count: 140,
      sampled_at: 1000,
    };
    const identicalValues: Metrics = {
      ...base,
      sampled_at: 2000,
      sample_duration_ms: 5,
    };
    const jitteredCpu: Metrics = {
      ...base,
      cpu_percent: 12.5, // 0.1% diff < 0.2%
    };
    const changedCpu: Metrics = {
      ...base,
      cpu_percent: 13.0, // 0.6% diff >= 0.2%
    };
    const changedMemory: Metrics = {
      ...base,
      memory_used_bytes: 4500000,
    };
    const changedProcesses: Metrics = {
      ...base,
      process_count: 141,
    };

    expect(areMetricsEqual(base, base)).toBe(true);
    expect(areMetricsEqual(base, identicalValues)).toBe(true);
    expect(areMetricsEqual(base, jitteredCpu)).toBe(true);
    expect(areMetricsEqual(base, changedCpu)).toBe(false);
    expect(areMetricsEqual(base, changedMemory)).toBe(false);
    expect(areMetricsEqual(base, changedProcesses)).toBe(false);
    expect(areMetricsEqual(base, null)).toBe(false);
    expect(areMetricsEqual(null, null)).toBe(true);
  });

  it('areProcessLifecyclesEqual detects changes in processes, pids, and counts', () => {
    const base: ProcessLifecycleSnapshot = {
      available: true,
      refreshed_at: 1000,
      claude_processes: 1,
      codex_processes: 0,
      processes: [{ pid: 1234, provider: 'claude', cwd: 'D:/work' }],
    };
    const same: ProcessLifecycleSnapshot = {
      ...base,
      refreshed_at: 2000,
    };
    const changedPid: ProcessLifecycleSnapshot = {
      ...base,
      processes: [{ pid: 5678, provider: 'claude', cwd: 'D:/work' }],
    };
    const changedCount: ProcessLifecycleSnapshot = {
      ...base,
      claude_processes: 2,
    };
    const changedProvider: ProcessLifecycleSnapshot = {
      ...base,
      processes: [{ pid: 1234, provider: 'codex', cwd: 'D:/work' }],
    };

    expect(areProcessLifecyclesEqual(base, same)).toBe(true);
    expect(areProcessLifecyclesEqual(base, changedPid)).toBe(false);
    expect(areProcessLifecyclesEqual(base, changedCount)).toBe(false);
    expect(areProcessLifecyclesEqual(base, changedProvider)).toBe(false);
    expect(areProcessLifecyclesEqual(base, null)).toBe(false);
  });

  it('areEventsEqual checks all fields including tool_name, source, cwd, and event', () => {
    const event1: AgentEvent = {
      schema_version: 1,
      source: 'claude',
      session_id: 's1',
      timestamp: '2026-10-27T10:00:00Z',
      event: 'ToolUse',
      tool_name: 'bash',
      cwd: 'D:/app',
    };
    const event2: AgentEvent = {
      schema_version: 1,
      source: 'codex',
      session_id: 's2',
      timestamp: '2026-10-27T10:01:00Z',
      event: 'UserPrompt',
    };

    expect(areEventsEqual([event1, event2], [event1, event2])).toBe(true);
    expect(areEventsEqual([], [])).toBe(true);
    expect(areEventsEqual([event1], [event1, event2])).toBe(false);

    // Change tool_name
    expect(areEventsEqual([event1], [{ ...event1, tool_name: 'read_file' }])).toBe(false);
    // Change source
    expect(areEventsEqual([event1], [{ ...event1, source: 'codex' }])).toBe(false);
    // Change cwd
    expect(areEventsEqual([event1], [{ ...event1, cwd: 'D:/other' }])).toBe(false);
    // Change event type
    expect(areEventsEqual([event1], [{ ...event1, event: 'Stop' }])).toBe(false);
    // Change timestamp
    expect(areEventsEqual([event1], [{ ...event1, timestamp: '2026-10-27T10:05:00Z' }])).toBe(false);
  });

  it('areAgentsEqual verifies tasks, names, workspaces, proofs, quotas, and liveness', () => {
    const baseAgent: Agent = {
      id: 'agent_1',
      provider: 'claude-code',
      name: 'Claude Lead',
      task: 'Refactoring telemetry',
      workspace: 'stxic-halo',
      workspacePath: 'D:/Tech/stxic-halo',
      status: 'working',
      contextPercent: 42,
      tokenUsage: 12000,
      contextTokens: 84000,
      contextWindow: 200000,
      usageObservedAt: '2026-10-27T10:00:00Z',
      lastSeen: '2026-10-27T10:02:00Z',
      isDemo: false,
      liveness: 'alive',
      proof: {
        verified: true,
        testsPassed: 47,
        testsFailed: 0,
        changedFiles: 3,
        provenance: 'local-test',
      },
      quotaWindows: [
        {
          label: 'weekly',
          used_percent: 65,
          resets_at: 1793404800,
          observed_at: '2026-10-27T10:00:00Z',
        },
      ],
    };

    const clone: Agent = { ...baseAgent, proof: { ...baseAgent.proof! }, quotaWindows: [{ ...baseAgent.quotaWindows![0] }] };
    expect(areAgentsEqual([baseAgent], [clone])).toBe(true);

    // Changed task
    expect(areAgentsEqual([baseAgent], [{ ...baseAgent, task: 'Building feature' }])).toBe(false);
    // Changed name
    expect(areAgentsEqual([baseAgent], [{ ...baseAgent, name: 'Agent 2' }])).toBe(false);
    // Changed workspacePath
    expect(areAgentsEqual([baseAgent], [{ ...baseAgent, workspacePath: 'D:/Other' }])).toBe(false);
    // Changed contextTokens
    expect(areAgentsEqual([baseAgent], [{ ...baseAgent, contextTokens: 90000 }])).toBe(false);
    // Changed liveness
    expect(areAgentsEqual([baseAgent], [{ ...baseAgent, liveness: 'exited' }])).toBe(false);
    // Changed proof testsFailed
    expect(areAgentsEqual([baseAgent], [{ ...baseAgent, proof: { ...baseAgent.proof!, testsFailed: 1 } }])).toBe(false);
    // Changed quota percentage
    expect(areAgentsEqual([baseAgent], [{ ...baseAgent, quotaWindows: [{ ...baseAgent.quotaWindows![0], used_percent: 70 }] }])).toBe(false);
  });

  it('areUsageResultsEqual detects quota, timestamp, and token counter updates', () => {
    const baseUsage: UsageReadResult = {
      reports: [
        {
          schema_version: 1,
          provider: 'claude-code',
          sessions: [
            {
              session_id: 's_abc',
              total_tokens: 15000,
              cost_usd: 0.12,
              observed_at: '2026-10-27T10:00:00Z',
            },
          ],
          quotas: [
            {
              label: 'monthly',
              used_percent: 45,
              resets_at: 1793404800,
              observed_at: '2026-10-27T10:00:00Z',
            },
          ],
        },
      ],
      errors: [],
    };

    const clone: UsageReadResult = JSON.parse(JSON.stringify(baseUsage));
    expect(areUsageResultsEqual(baseUsage, clone)).toBe(true);

    // Changed quota percent
    const quotaChange: UsageReadResult = JSON.parse(JSON.stringify(baseUsage));
    quotaChange.reports[0].quotas[0].used_percent = 46;
    expect(areUsageResultsEqual(baseUsage, quotaChange)).toBe(false);

    // Changed quota reset date
    const resetChange: UsageReadResult = JSON.parse(JSON.stringify(baseUsage));
    resetChange.reports[0].quotas[0].resets_at = 1793491200;
    expect(areUsageResultsEqual(baseUsage, resetChange)).toBe(false);

    // Changed session cost
    const costChange: UsageReadResult = JSON.parse(JSON.stringify(baseUsage));
    costChange.reports[0].sessions[0].cost_usd = 0.15;
    expect(areUsageResultsEqual(baseUsage, costChange)).toBe(false);

    // Added error
    const errChange: UsageReadResult = JSON.parse(JSON.stringify(baseUsage));
    errChange.errors.push('Disk read failed');
    expect(areUsageResultsEqual(baseUsage, errChange)).toBe(false);
  });
});
