# OpenPlanter Web Deep Upgrade Work Log

## 2026-08-23

### Decisions
- Implementation branch: `chatgpt/openplanter-web-deep-upgrade-impl`, based on `v0/openplanter-36c03735`.
- Built-in browser retrieval will use current OpenRouter server tools (`openrouter:web_search`, `openrouter:web_fetch`) rather than the legacy web plugin.
- Subagents will use OpenRouter's `openrouter:subagent` server tool.
- Exa/Firecrawl user keys remain optional enhancements, not prerequisites.
- Browser run diagnostics will update one mutable row instead of appending one permanent step line per event.
- Mobile navigation will expose New/Threads without requiring landscape orientation.

### Confirmed root causes
1. Browser event forwarding can re-dispatch events onto names already subscribed to, producing duplicate status handling.
2. Mobile CSS hides the sidebar at <=760px, removing the only session/thread controls.
3. After removing the old web plugin, browser retrieval has no keyless OpenRouter server-tool path and therefore depends on optional Exa/Firecrawl credentials.

### Verification infrastructure
- Local sandbox cannot resolve `github.com`, so local clone/test execution is unavailable.
- Added `Frontend CI` to `main` to run `npm ci`, `npm test`, and `npm run build` on pull requests.
- Draft PR #4 is the isolated verification surface.

### Current checkpoint
- Design spec committed.
- Reviewed implementation plan committed.
- Waiting for first PR CI baseline before production changes.