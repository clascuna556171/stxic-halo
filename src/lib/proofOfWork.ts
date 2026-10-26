import { isDesktop, verifyProofOfWork } from './desktop';
import type {
  GitFileChange,
  GitStatusSummary,
  ProofOfWorkVerifierContract,
  ProofSummary,
} from '../types';

export const ALLOWLISTED_TEST_PROFILES = [
  'npm test',
  'cargo test',
  'pnpm test',
  'yarn test',
  'vitest run',
  'pytest',
] as const;

export type AllowlistedTestProfile = (typeof ALLOWLISTED_TEST_PROFILES)[number];

export function isTestProfileAllowlisted(profile: string): profile is AllowlistedTestProfile {
  return (ALLOWLISTED_TEST_PROFILES as readonly string[]).includes(profile.trim());
}

export function parseGitStatusPorcelain(output: string): number {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('##')).length;
}

export function parseGitStatusSummary(output: string): GitStatusSummary {
  let branch: string | null = null;
  const files: GitFileChange[] = [];
  let stagedCount = 0;
  let modifiedCount = 0;
  let untrackedCount = 0;

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    if (line.startsWith('## ')) {
      const b = line.slice(3).trim();
      const dotIdx = b.indexOf('...');
      const spaceIdx = b.indexOf(' ');
      if (dotIdx !== -1) {
        branch = b.slice(0, dotIdx);
      } else if (spaceIdx !== -1) {
        branch = b.slice(0, spaceIdx);
      } else {
        branch = b;
      }
      continue;
    }

    if (line.length < 3) continue;

    const x = line[0] ?? ' ';
    const y = line[1] ?? ' ';
    const path = line.slice(3).trim().replace(/^"|"$/g, '');

    const isUntracked = x === '?' && y === '?';
    const isStaged = x !== ' ' && x !== '?';
    const isUnstaged = y !== ' ' && y !== '?';

    let statusDesc = 'unchanged';
    if (isUntracked) {
      untrackedCount++;
      statusDesc = 'untracked';
    } else {
      if (isStaged) stagedCount++;
      if (isUnstaged) modifiedCount++;
      if (isStaged && isUnstaged) {
        statusDesc = 'staged+modified';
      } else if (isStaged) {
        statusDesc = `staged (${x})`;
      } else if (isUnstaged) {
        statusDesc = `modified (${y})`;
      }
    }

    files.push({
      path,
      status: statusDesc,
      staged: isStaged,
    });
  }

  return {
    branch,
    clean: files.length === 0,
    total_changed: files.length,
    staged_count: stagedCount,
    modified_count: modifiedCount,
    untracked_count: untrackedCount,
    files,
  };
}

export function isWorkspaceApproved(
  workspacePath: string,
  approvedWorkspaces: readonly string[]
): boolean {
  const normalize = (p: string) =>
    p
      .trim()
      .toLowerCase()
      .replace(/\\/g, '/')
      .replace(/\/+$/, '');
  const target = normalize(workspacePath);
  if (!target) return false;
  return approvedWorkspaces.some((app) => normalize(app) === target);
}

export class LocalGitProofOfWorkVerifier implements ProofOfWorkVerifierContract {
  readonly id = 'local-git-pow';
  private approvedWorkspaces: Set<string>;

  constructor(initialApproved: readonly string[] = []) {
    this.approvedWorkspaces = new Set(initialApproved.map((w) => w.trim()));
  }

  approveWorkspace(workspacePath: string): void {
    const trimmed = workspacePath.trim();
    if (trimmed) {
      this.approvedWorkspaces.add(trimmed);
    }
  }

  revokeWorkspace(workspacePath: string): void {
    const trimmed = workspacePath.trim();
    this.approvedWorkspaces.delete(trimmed);
  }

  isApproved(workspacePath: string): boolean {
    return isWorkspaceApproved(workspacePath, [...this.approvedWorkspaces]);
  }

  getApprovedWorkspaces(): string[] {
    return [...this.approvedWorkspaces];
  }

  async verifyWorkspace(
    workspacePath: string,
    options?: { runTests?: boolean; testProfile?: string }
  ): Promise<ProofSummary | null> {
    if (!this.isApproved(workspacePath)) {
      throw new Error(
        `Workspace "${workspacePath}" is not user-approved for Proof-of-Work inspection.`
      );
    }

    if (options?.testProfile && !isTestProfileAllowlisted(options.testProfile)) {
      throw new Error(
        `Test profile "${options.testProfile}" is not allowlisted. Allowed profiles: ${ALLOWLISTED_TEST_PROFILES.join(', ')}`
      );
    }

    if (isDesktop()) {
      return verifyProofOfWork(workspacePath, options);
    }

    // In browser preview / mock mode (non-Tauri):
    // Strict truth-over-vibes: mock mode never claims real verification or fake passed tests.
    return {
      changedFiles: 0,
      changed_files: 0,
      testsPassed: null,
      tests_passed: null,
      testsFailed: null,
      tests_failed: null,
      verified: false,
      git: {
        branch: 'mock',
        clean: true,
        total_changed: 0,
        staged_count: 0,
        modified_count: 0,
        untracked_count: 0,
        files: [],
      },
      provenance:
        'Browser preview mock — native desktop runner required for verification (unverified)',
      evidenceTimestamp: Date.now(),
      evidence_timestamp: Date.now(),
    };
  }
}

export const localProofOfWorkVerifier = new LocalGitProofOfWorkVerifier();
