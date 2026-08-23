// core.spec.ts — 双模型 Auto 核心逻辑单测 (纯工厂, 无 Cordis 依赖)
import { describe, expect, it } from 'vitest'
import { createCore, fingerprintOf, judgeOf } from '../src/core.ts'

const T = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  text: '短任务', domain: '治理', context_count: 1, ...over,
})

describe('judgeOf 六判据', () => {
  it('域内短任务 → 判据不触发', () => {
    expect(judgeOf(T(), {})).toBeNull()
  })
  it('域外 → 规则不存在', () => {
    expect(judgeOf(T({ domain: '符箓' }), {})).toBe('规则不存在')
  })
  it('规则冲突 → 规则冲突', () => {
    expect(judgeOf(T({ rule_conflicts: 1 }), {})).toBe('规则冲突')
  })
  it('超长 → 上下文不足', () => {
    expect(judgeOf(T({ text: 'x'.repeat(1500) }), {})).toBe('上下文不足')
  })
  it('高上下文 → 上下文不足', () => {
    expect(judgeOf(T({ context_count: 5 }), {})).toBe('上下文不足')
  })
  it('低置信 → 结果不确定', () => {
    expect(judgeOf(T({ confidence: 0.3 }), {})).toBe('结果不确定')
  })
  it('高新颖 → 发现新模式', () => {
    expect(judgeOf(T({ novelty: 0.9 }), {})).toBe('发现新模式')
  })
})

describe('fingerprintOf 指纹', () => {
  it('指纹 = domain|ctx|band', () => {
    expect(fingerprintOf(T({ text: '短' }))).toBe('治理|1|band0')
    expect(fingerprintOf(T({ text: 'x'.repeat(250) }))).toBe('治理|1|band1')
  })
})

describe('route + 逃逸学习闭环', () => {
  it('直返 → 标定答错 → 同指纹强制升级', () => {
    const core = createCore()
    const task = T()
    expect(core.route(task).decision).toBe('direct')
    const m = core.markEscape(task, false)
    expect(m.marked).toBe(true)
    const rec = core.route(task)
    expect(rec.decision).toBe('upgrade')
    expect(rec.reason).toBe('逃逸学习')
  })

  it('标定正确 → 不学习', () => {
    const core = createCore()
    const task = T()
    core.route(task)
    const m = core.markEscape(task, true)
    expect(m.marked).toBe(false)
    expect(core.learned()).toHaveLength(0)
  })

  it('衰减: 连续命中达阈值后交还判据', () => {
    const core = createCore({ decayHits: 3 })
    const task = T()
    core.route(task)
    core.markEscape(task, false)
    expect(core.route(task).decision).toBe('upgrade') // hits 1
    expect(core.route(task).decision).toBe('upgrade') // hits 2
    expect(core.route(task).decision).toBe('upgrade') // hits 3 → 达阈值本次仍升级
    expect(core.learned()).toHaveLength(0) // 已达阈值移除
    expect(core.route(task).decision).toBe('direct') // 交还判据
  })

  it('再逃逸重置衰减计数', () => {
    const core = createCore({ decayHits: 3 })
    const task = T()
    core.route(task)
    core.markEscape(task, false)
    core.route(task) // hits 1
    core.markEscape(task, false) // 再逃逸 → hits 清零, escapes 2
    const e = core.learned().find((x) => x.fp === '治理|1|band0')
    expect(e?.escapes).toBe(2)
    expect(e?.hits).toBe(0)
  })
})

describe('统计与状态导出/恢复', () => {
  it('stats 聚合正确', () => {
    const core = createCore()
    core.route(T())
    core.route(T({ domain: '符箓' }))
    const s = core.stats()
    expect(s.total).toBe(2)
    expect(s.upgrades).toBe(1)
    expect(s.directs).toBe(1)
    expect(s.cost).toBe(1 + 5)
  })

  it('导出/恢复幂等 (持久化互通)', () => {
    const core = createCore()
    core.route(T())
    core.markEscape(T(), false)
    const fp = core.exportFingerprints()
    const st = core.exportStats()
    const log = core.exportLog()
    const core2 = createCore()
    const fp2 = new Map(Object.entries(fp).map(([k, v]) => [k, { escapes: v.escapes, hits: v.hits }]))
    core2.restoreState(fp2, st, log)
    expect(core2.stats().total).toBe(1)
    expect(core2.route(T()).decision).toBe('upgrade') // 恢复的指纹生效
  })
})
