# dsh-dual-auto

**Dual-model auto-routing plugin for the DeepSeek Harness (dsh).**

Low-cost direct / high-cost upgrade with an escape-learning closed loop.

## Install

```sh
pnpm add @lengquan88/dsh-dual-auto
```

## Enable

Add one row to your profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: dual-auto
      name: '@lengquan88/dsh-dual-auto'
```

Restart `dsh web`. The tools `dual_model_route`, `dual_model_run`, and
`dual_model_mark` become available in every session.

## Tools

| Tool | Purpose |
| --- | --- |
| `dual_model_route` | Six-criteria routing decision (length / context / domain coverage / rule conflict / confidence / novelty → six labels). Fingerprints that escaped once are force-upgraded. |
| `dual_model_run` | Decision + real model call: `direct` → `deepseek-v4-flash`, `upgrade` → `deepseek-v4-pro` (auto-degrade to flash on failure, marked `degraded`). Probe tasks auto-validate against a gold set — wrong direct answers trigger escape learning. |
| `dual_model_mark` | Mark the quality of a direct result. `correct=false` learns the fingerprint and rewrites the disk log marker; the same fingerprint is force-upgraded next time. |

## Persistence

State persists to `output/dsh_router_{fingerprints,stats}.json` and
`dsh_router_decision_log.jsonl` — interoperable with the project's Python
`dao/model_router.py` (v2 dict fingerprints load directly).

## Links

- npm: <https://www.npmjs.com/package/@lengquan88/dsh-dual-auto>
- Source mirror (atomgit): <https://atomgit.com/guaikepa/zhonghua/tree/main/dsh-dual-auto>

## License

MIT
