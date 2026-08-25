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

## Verified interop (measured 2026-08-24, R182 aligned)

- **Fingerprint formula**: identical (100 chars → `band0`, 250 → `band1`) —
  verified against `model_router.task_fingerprint` with the plugin's real
  `fingerprintOf` output.
- **Fingerprints file** `{fingerprint: {escapes, hits}}` loads into
  `ModelRouter` as a v2 subset (`learned_ts`/`last_escape_ts` default to now),
  and `route()` then force-upgrades the fingerprint (`reason=逃逸学习`);
  verified end-to-end in `tests/test_dual_auto_interop.py`.
- **Decision log — double channel (R182)**: the Python
  `learn_escapes_from_log` reader now accepts **`escape`** (legacy),
  **`escaped`** (plugin core rows), and **`auto_escaped`** (runTask overlay) —
  so escape state learned in a plugin session is picked up from the *log* too,
  not only from the fingerprints file. Verified: plugin log with
  `"escaped": true` yields 1 learned fingerprint in `ModelRouter`.
