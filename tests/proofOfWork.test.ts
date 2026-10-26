import { describe, expect, it } from 'vitest';
import {
  isTestProfileAllowlisted,
  isWorkspaceApproved,
  LocalGitProofOfWorkVerifier,
  parseGitStatusPorcelain,
  parseGitStatusSummary,
} from '../src/lib/proofOfWork';

describe('Proof of Work: Allowlisted Test Profiles & Git Porcelain Parser', () => {
  it('strictly validates allowlisted test profiles', () => {
    expect(isTestProfileAllowlisted('npm test')).toBe(true);
    expect(isTestProfileAllowlisted('cargo test')).toBe(true);
    expect(isTestProfileAllowlisted('pnpm test')).toBe(true);
    expect(isTestProfileAllowlisted('yarn test')).toBe(true);
    expect(isTestProfileAllowlisted('vitest run')).toBe(true);
    expect(isTestProfileAllowlisted('pytest')).toBe(true);

    // Reject arbitrary command injections and unrecognized runners
    expect(isTestProfileAllowlisted('rm -rf /')).toBe(false);
    expect(isTestProfileAllowlisted('npm test && echo pwned')).toBe(false);
    expect(isTestProfileAllowlisted('bash script.sh')).toBe(false);
    expect(isTestProfileAllowlisted('curl https://malicious.site')).toBe(false);
  });

  it('accurately parses git status --porcelain lines', () => {
    const porcelainSample = `
 M src/lib/proofOfWork.ts
 M src/types.ts
?? tests/proofOfWork.test.ts
A  assets/new-icon.svg
D  old_script.ps1
`;
    expect(parseGitStatusPorcelain(porcelainSample)).toBe(5);
    expect(parseGitStatusPorcelain('')).toBe(0);
    expect(parseGitStatusPorcelain('   \n\n\r\n')).toBe(0);
  });

  it('parses structured git status summary including branch and file statuses', () => {
    const porcelainSample = `## main...origin/main [ahead 1]
 M src/App.tsx
M  src-tauri/src/lib.rs
?? new_component.tsx
D  old_file.ts
`;
    const summary = parseGitStatusSummary(porcelainSample);
    expect(summary.branch).toBe('main');
    expect(summary.clean).toBe(false);
    expect(summary.total_changed).toBe(4);
    expect(summary.staged_count).toBe(2);
    expect(summary.modified_count).toBe(1);
    expect(summary.untracked_count).toBe(1);
    expect(summary.files).toHaveLength(4);
    expect(summary.files[0]).toEqual({
      path: 'src/App.tsx',
      status: 'modified (M)',
      staged: false,
    });
    expect(summary.files[1]).toEqual({
      path: 'src-tauri/src/lib.rs',
      status: 'staged (M)',
      staged: true,
    });
    expect(summary.files[2]).toEqual({
      path: 'new_component.tsx',
      status: 'untracked',
      staged: false,
    });
  });

  it('checks user-approved workspace boundaries with path normalization', () => {
    const approved = ['C:\\Projects\\my-app', 'D:/work/repo/'];

    expect(isWorkspaceApproved('C:\\Projects\\my-app', approved)).toBe(true);
    expect(isWorkspaceApproved('c:\\projects\\my-app\\', approved)).toBe(true);
    expect(isWorkspaceApproved('D:\\work\\repo', approved)).toBe(true);
    expect(isWorkspaceApproved('C:\\Projects\\unapproved-app', approved)).toBe(false);
    expect(isWorkspaceApproved('', approved)).toBe(false);
  });
});

describe('ProofOfWorkVerifierContract implementation', () => {
  it('refuses to inspect unapproved workspaces', async () => {
    const verifier = new LocalGitProofOfWorkVerifier(['C:\\authorized\\repo']);

    await expect(
      verifier.verifyWorkspace('C:\\unauthorized\\repo')
    ).rejects.toThrow(/not user-approved/);
  });

  it('allows approving and revoking workspaces dynamically', async () => {
    const verifier = new LocalGitProofOfWorkVerifier();

    expect(verifier.isApproved('C:\\my-project')).toBe(false);
    verifier.approveWorkspace('C:\\my-project');
    expect(verifier.isApproved('C:\\my-project')).toBe(true);

    verifier.revokeWorkspace('C:\\my-project');
    expect(verifier.isApproved('C:\\my-project')).toBe(false);
  });

  it('rejects unallowlisted test runners even for approved workspaces', async () => {
    const verifier = new LocalGitProofOfWorkVerifier(['C:\\my-project']);

    await expect(
      verifier.verifyWorkspace('C:\\my-project', {
        runTests: true,
        testProfile: 'custom-malicious-runner',
      })
    ).rejects.toThrow(/not allowlisted/);
  });

  it('enforces truth-over-vibes: browser mock mode never grants verified status or fake test passes', async () => {
    const verifier = new LocalGitProofOfWorkVerifier(['C:\\my-project']);

    const result = await verifier.verifyWorkspace('C:\\my-project', {
      runTests: true,
      testProfile: 'npm test',
    });

    expect(result).not.toBeNull();
    expect(result?.verified).toBe(false);
    expect(result?.testsPassed).toBeNull();
    expect(result?.provenance).toContain('unverified');
  });
});
