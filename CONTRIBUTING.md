# Contributing to STXIC Halo

1. Open a focused issue describing the bug, why it matters and reproducible steps.
2. Build the web demo and Windows shell locally before submitting platform changes.
3. Keep new data sources explicit and opt-in. Do not silently access prompts, chat logs, credentials, clipboard or code.
4. No arbitrary shell execution from model output. All verification commands require informed user consent.
5. Include unit tests where possible; include Windows hardware test notes for native changes.
6. Follow the status labels: **live**, **estimated**, **stale**, **unavailable**, **sample**.
7. Do not copy GPL/AGPL code into this MIT project without legal review and a deliberate license decision.
8. Submit pull requests with screenshots for visual changes and with privacy implications documented.

Coding conventions: TypeScript strict, React function components, Rust explicit `Result`, kebab-case docs and CSS utility names. Format new code consistently and ensure keyboard focus accessibility.
