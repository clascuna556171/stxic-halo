import { isDesktop, verifyProofOfWork } from './desktop';
import type { ProofOfWorkVerifierContract, ProofSummary } from '../types';

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
    .filter((line) => line.length > 0).length;
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

    // In browser preview / mock mode with approved workspace:
    return {
      changedFiles: 0,
      testsPassed: options?.runTests ? 1 : null,
      testsFailed: options?.runTests ? 0 : null,
      verified: Boolean(options?.runTests),
    };
  }
}

export const localProofOfWorkVerifier = new LocalGitProofOfWorkVerifier();
