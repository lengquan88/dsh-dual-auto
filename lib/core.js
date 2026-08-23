const DEFAULT_DOMAINS = ['治理', '感知', '记忆', '门禁', '共振', '炼丹', '炼体', '因果'];
const BANDS = [[0, 200], [200, 800], [800, 3000], [3000, Number.POSITIVE_INFINITY]];
const num = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
};
const bandOf = (len, bands) => {
    for (let i = 0; i < bands.length; i++)
        if (len >= bands[i][0] && len < bands[i][1])
            return i;
    return bands.length;
};
export function fingerprintOf(task, bands = BANDS) {
    return String(task.domain || '?') + '|' + num(task.context_count, 0) + '|band' +
        bandOf(String(task.text || '').length, bands);
}
export function judgeOf(task, opts) {
    const domains = opts.domains ?? DEFAULT_DOMAINS;
    const text = String(task.text || '');
    const domain = String(task.domain || '');
    const ctxN = num(task.context_count, 0);
    const conf = num(task.confidence, 1);
    const nov = num(task.novelty, 0);
    const cf = num(task.rule_conflicts, 0);
    if (!domains.includes(domain))
        return '规则不存在';
    if (cf > 0)
        return '规则冲突';
    if (text.length > (opts.lenMax ?? 1400) || ctxN > (opts.ctxMax ?? 3))
        return '上下文不足';
    if (conf < (opts.confMin ?? 0.6))
        return '结果不确定';
    if (nov > (opts.novMax ?? 0.7))
        return '发现新模式';
    return null;
}
export function createCore(options = {}) {
    const escaped = new Map();
    const log = [];
    const stats = { total: 0, upgrades: 0, directs: 0, escapes: 0, cost: 0, latency: 0 };
    const costDirect = options.costDirect ?? 1;
    const costUpgrade = options.costUpgrade ?? 5;
    const latDirect = options.latDirect ?? 0.1;
    const latUpgrade = options.latUpgrade ?? 3;
    const decayHits = options.decayHits ?? 10;
    const logCap = options.logCap ?? 500;
    function route(task) {
        const fp = fingerprintOf(task);
        const label = judgeOf(task, options);
        let decision;
        let reason;
        if (label !== null) {
            decision = 'upgrade';
            reason = label;
        }
        else if (escaped.has(fp)) {
            decision = 'upgrade';
            reason = '逃逸学习';
            const e = escaped.get(fp);
            e.hits += 1;
            if (e.hits >= decayHits)
                escaped.delete(fp); // 衰减: 连续命中交还判据
        }
        else {
            decision = 'direct';
            reason = '判据未触发';
        }
        const cost = decision === 'direct' ? costDirect : costUpgrade;
        const latency = decision === 'direct' ? latDirect : latUpgrade;
        stats.total += 1;
        stats.cost += cost;
        stats.latency += latency;
        if (decision === 'upgrade')
            stats.upgrades += 1;
        else
            stats.directs += 1;
        const rec = {
            ts: new Date().toISOString(), fingerprint: fp, decision, reason,
            label: label || '', task_len: String(task.text || '').length,
            domain: String(task.domain || '?'), context_count: num(task.context_count, 0),
            cost, latency, probe: Boolean(task.probe),
        };
        log.push(rec);
        if (log.length > logCap)
            log.shift();
        return rec;
    }
    function markEscape(task, correct) {
        const fp = fingerprintOf(task);
        const prev = log.filter((r) => r.fingerprint === fp && r.decision === 'direct' && !r.escaped);
        const target = prev[prev.length - 1];
        if (target)
            target.escaped = true;
        if (correct === false) {
            stats.escapes += 1;
            const e = escaped.get(fp);
            if (e) {
                e.escapes += 1;
                e.hits = 0;
            }
            else
                escaped.set(fp, { escapes: 1, hits: 0 });
            return { marked: true, fingerprint: fp, escapes: (escaped.get(fp) || { escapes: 1 }).escapes, note: '同指纹下次强制升级 (逃逸学习)' };
        }
        return { marked: false, fingerprint: fp, escapes: 0, note: '结果正确, 不标定' };
    }
    return {
        route,
        markEscape,
        stats: () => ({ ...stats }),
        learned: () => [...escaped.entries()].map(([fp, e]) => ({ fp, escapes: e.escapes, hits: e.hits })),
        log: () => log.slice(),
        restoreState(escapedMap, statMap, logRows) {
            escaped.clear();
            for (const [fp, e] of escapedMap)
                escaped.set(fp, { ...e });
            for (const k of Object.keys(stats))
                stats[k] = 0;
            for (const k of Object.keys(statMap))
                if (num(statMap[k], 0) > 0)
                    stats[k] = num(statMap[k], 0);
            log.length = 0;
            log.push(...logRows.slice(-logCap));
        },
        exportFingerprints: () => {
            const out = {};
            for (const [fp, e] of escaped.entries())
                out[fp] = { escapes: e.escapes, hits: e.hits };
            return out;
        },
        exportStats: () => ({ ...stats }),
        exportLog: () => log.slice(),
    };
}
