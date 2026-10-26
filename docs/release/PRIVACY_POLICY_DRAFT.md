# STXIC Halo — Privacy Policy (DRAFT — REVIEW BEFORE PUBLICATION)

**Last edited:** 2026-10-25

This draft describes the current local-first prototype. It is **not** a substitute for jurisdiction-specific legal advice. Replace missing company details and confirm shipping behavior before publishing any policy.

## 1. Information processed locally
Halo's current Windows prototype reads CPU utilization, system memory statistics and process count on your computer. If you manually enable the Claude Code hook, Halo stores minimal local session metadata: session ID, event name, timestamp, tool name and working directory. Project paths and session metadata may reveal details about your work and should be treated as sensitive.

## 2. What is not collected by this prototype
The prototype does not request an account, analytics identity, source-code contents, prompts, model responses, clipboard or credential-store values. It does not upload system or hook data to a STXIC server. Preview-mode data is simulated and is not drawn from your computer.

## 3. Storage and retention
When enabled, Claude lifecycle metadata is stored in `%LOCALAPPDATA%\STXICHalo\events.jsonl`. The runtime automatically rotates the file when it exceeds 2 MiB, maintaining at most one backup file (`events.jsonl.bak`) to prevent disk bloat. In-memory event queues are capped at 250 items with FIFO eviction. You may clear events at any time from the Hooks view or remove the hook configuration.

## 4. Permissions and your controls
You choose whether to install the Claude Code hook. Halo does not modify Claude settings automatically. You can disconnect by removing Halo-specific hook entries and restarting Claude. You can enable Demo mode in Halo at any time.

## 5. Third-party services
Halo's first prototype does not integrate directly with online APIs or send account credentials to third parties. Claude Code itself is independently operated by its provider and subject to its own terms and policy. Future cloud features require a revised policy.

## 6. Support and contact
**[REPLACE WITH VERIFIED STXIC LEGAL ENTITY AND SUPPORT EMAIL/WEBSITE]**. A contact and privacy-request process must be published before launch.

## 7. Changes
Any material changes to data processing, third-party services or telemetry require an updated policy and in-product notice/consent where applicable.
