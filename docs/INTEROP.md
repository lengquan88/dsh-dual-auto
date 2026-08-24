# Interop with the Python ModelRouter

This plugin persists its escape-learning state in three files at the given
`OUT` directory (default: `<project>/output/`):

| File | Format | Written by |
|------|--------|------------|
| `dsh_router_fingerprints.json` | `{ fingerprint: { escapes, hits } }` | plugin (export) |
| `dsh_router_stats.json` | `{ calls, upgrades, directs, degraded, ... }` | plugin (stats) |
| `dsh_router_decision_log.jsonl` | one JSON record per route decision | plugin (log, last 200 rows kept) |

All three are append-format compatible with the Python project
`dao/model_router.py` (`ModelRouter`) in the parent project
(中华文明数字永生体：全维度融合架构项目): `ModelRouter` reads the same
`{ fingerprint: { escapes, hits } }` map and the same decision-log fields
(`decision`, `reason`, `label`, `fingerprint`, `cost`, `latency`,
`model_used`, `call_ms`, `answer_len`, `degraded`, `auto_escaped`), so state
updated by the plugin in one session is picked up by the Python router in the
next and vice versa.

`fingerprint` = `domain|context_count|band` where band derives from text
length (`band0` ≤ 200 chars, `band1` > 200; see `src/core.ts`). The Python
side must reproduce this fingerprint formula exactly; mismatches degrade to a
non-shared hint set (still safe — both sides treat unknowns as `direct`).

## Schema (single source of truth)

The canonical field definitions live in `src/core.ts` (`createCore`,
`exportFingerprints`, `exportStats`, `exportLog`) and their Python twin in
`dao/model_router.py` of the parent project. Changes must be mirrored on both
sides; `dsh_router_*` files are the contract.
