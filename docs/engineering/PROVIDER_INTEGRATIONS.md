# Coding agent connections and usage

Halo supports five provider identities: Claude Code, Codex, Antigravity,
GitHub Copilot CLI, and OpenCode. Context occupancy, cumulative session usage,
and subscription allowance are separate measurements.

## Connect

In the desktop app, open **Settings → More coding agents** and click **Connect**.
Start a new provider session afterward. Installation is opt-in; opening Halo or
Settings never changes provider configuration.

| Provider | Installed integration | Automatic usage |
| --- | --- | --- |
| Claude Code | Existing Claude bridge | Lifecycle only; usage needs a local export |
| Codex | Existing local rollout reader | Cumulative tokens and logged quota windows/reset timestamps; cost unavailable |
| Antigravity | Named `stxic-halo` entry in `~/.gemini/config/hooks.json` | Lifecycle only; usage needs a local export |
| GitHub Copilot CLI | Dedicated `stxic-halo.json` in `%COPILOT_HOME%/hooks`, or `~/.copilot/hooks`; passive session-state usage reader | Recorded cumulative tokens and premium requests; no account quota or USD conversion |
| OpenCode | `stxic-halo.js` in `$XDG_CONFIG_HOME/opencode/plugins`, or `~/.config/opencode/plugins` | Session tokens and provider-reported USD cost; quota needs a local export |

Antigravity's configuration applies to its App, IDE, and CLI versions that support
the documented hooks. Copilot's integration targets **local Copilot CLI**; it does
not monitor GitHub-hosted cloud agents or automatically configure the VS Code
extension. Hook/plugin support and payloads depend on the installed provider version.

The PowerShell bridge is embedded in Halo and installed at
`%LOCALAPPDATA%/STXICHalo/integrations/provider-hook.ps1`, so packaged builds do not
depend on a source checkout. OpenCode's plugin is also embedded. Existing unrelated
hooks are preserved. Existing files receive a first-write `.halo-backup` copy.
Disconnect removes only Halo's entry or dedicated file. Restart the provider to
unload its hooks/plugin; historical events and usage snapshots remain available.

New providers use source-qualified session identities. They are not marked as
exited based on the Claude/Codex process scanner. Stops are unverified turn
completion, never proof that code/tests succeeded. Halo does not approve or deny
requests for these providers; approval remains in the provider application.

## Usage & limits

**Overview → Usage & limits** shows all five providers together, each with subscription quota and
reset times, individual session token totals and reported costs. There is no provider dropdown. Zero is a
valid reported value; missing values say **Unavailable**.

Codex's `total_token_usage.total_tokens` supplies cumulative session usage.
`last_token_usage.total_tokens` supplies context occupancy only. Each logged
`rate_limits` pool/window stays separate and keeps its observation timestamp;
percentages are never summed across sessions. No token-to-quota or token-to-price
conversion is inferred. OpenCode totals are recomputed from assistant message
metadata and deduplicated by message ID, including on resume/plugin restart.
Input, output, reasoning and cache read/write counts follow OpenCode's breakdown.
Unknown token components make the total unavailable. Costs are reported estimates
from OpenCode and may differ from an invoice or subscription charge.

Copilot's existing `%COPILOT_HOME%/session-state/*/events.jsonl` files (default
`~/.copilot/session-state`) are read without installing hooks or starting a CLI
session. The newest cumulative `session.shutdown` or `session.usage_checkpoint`
record supplies its own timestamp and reported premium-request counter. When
`accountingSnapshot.modelMetrics.*.usage.inputTokens/outputTokens` (or the
legacy top-level `modelMetrics`) are present for every model,
their totals are summed within that single snapshot. Checkpoints and resumed
shutdowns are never added together. Missing components remain unknown. Premium
requests and nano-AI units are not converted to USD or account quota.
Legacy shutdown model breakdowns can be partial across resumes; Halo shows the
latest logged snapshot rather than reconstructing an unverified lifetime total.
The reader scans at most 1,024 session directories, reads at most 16 recent
256 KiB tails, and caches unchanged files by length and modification time.

Missing readings have provider-specific explanations. In particular, Claude's
lifecycle bridge does not connect its separate status-line metrics, Antigravity
hooks do not include quota/tokens, and OpenCode requires the Halo plugin to be
connected before it can publish usage. Installing the provider itself does not
install Halo's plugin.

Snapshots older than 15 minutes are marked as a last report. After a reported
reset time passes, Halo shows **Awaiting refresh**, rather than assuming an account
has a fresh allowance. Local reports do not poll a provider's account service.

## Local usage export contract

For metrics the local provider does not publish, another trusted local exporter
can write `%LOCALAPPDATA%/STXICHalo/usage/<provider>.json`. The filename and `provider`
must match one of `claude-code`, `codex`, `antigravity`, `github-copilot`, `opencode`.
Use a temporary file and atomic replacement to avoid partial reads. These are
provider/user-supplied snapshots, not independently verified account readings.

The following is an **illustrative schema example, not an actual usage reading**:

```json
{
  "schema_version": 1,
  "provider": "antigravity",
  "sessions": [
    {
      "session_id": "the-provider-session-id",
      "total_tokens": null,
      "cost_usd": null,
      "observed_at": "2026-10-27T00:00:00Z"
    }
  ],
  "quotas": [
    {
      "label": "Model quota",
      "used_percent": 25,
      "window_minutes": 300,
      "resets_at": 1793070000,
      "observed_at": "2026-10-27T00:00:00Z"
    }
  ]
}
```

Only export numbers actually reported by the provider. Omit unknown quota windows;
do not use 0 for unknown usage. `resets_at` is Unix **seconds**, `observed_at` is UTC
ISO 8601 ending in `Z`, and `cost_usd` is a nonnegative reported USD amount or null.
Exports are limited to 64 KiB, 16 sessions and 8 quota windows per file; mismatched
providers and invalid numbers are rejected with a visible usage error. Unknown
fields are not forwarded to the UI. No credentials belong in these files.

OpenCode maintains separate atomic snapshots under `usage/opencode-sessions/`,
capped at 32 files, so independent hosts don't overwrite each other's totals.
Halo reads up to 16 recent session snapshots in addition to fixed provider exports.

## Privacy and verification

No new outbound connections or credential access are introduced. Hook payloads
are sanitized to lifecycle metadata. OpenCode queries its own session SDK and
persists only numeric usage, IDs and timestamps; prompts, message parts, tool
arguments, error text, and credentials are not written to Halo's logs/snapshots.
Events rotate at 2 MiB. Bridge failures return no permission decision and do not
interrupt the provider. Hooks capture only the first workspace path when
Antigravity reports multiple workspaces.

Verification covers native schema/installer tests, real Windows PowerShell
payloads, OpenCode SDK fixtures, usage semantics, and browser UI behavior. A live
authenticated session in each provider is still needed to verify compatibility
with the user's installed versions and plan.

Owning references:

- [Antigravity hooks](https://antigravity.google/docs/hooks)
- [Copilot hook formats and payloads](https://docs.github.com/en/copilot/reference/hooks-reference)
- [Copilot usage signals and accounting units](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/usage-and-billing)
- [Claude status-line usage and quota fields](https://code.claude.com/docs/en/statusline)
- [OpenCode plugins](https://opencode.ai/docs/plugins/)
- [OpenCode session SDK](https://opencode.ai/docs/sdk/)
- [OpenCode token/cost metadata](https://github.com/anomalyco/opencode/blob/v1.19.4/packages/sdk/js/src/gen/types.gen.ts)
- [Codex rate-limit protocol](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs)
