import { createCore, fingerprintOf } from './core.js';
export const name = 'dual-auto';
export const inject = ['fs', 'tools'];
const PROVIDER = 'deepseek-official';
const MODEL_FLASH = 'deepseek-v4-flash';
const MODEL_PRO = 'deepseek-v4-pro';
const OUT = 'E:/中华文明数字永生体：全维度融合架构项目/output';
const FP_FILE = OUT + '/dsh_router_fingerprints.json';
const LOG_FILE = OUT + '/dsh_router_decision_log.jsonl';
const STAT_FILE = OUT + '/dsh_router_stats.json';
const WPOL = { mode: 'danger-full-access', workspaceRoot: OUT };
const PERSIST_GAP_MS = 400; // 时间戳节流, 不依赖 timer 服务
// 探针黄金对照: 已知难题探针 direct 且结果≠黄金 → 自动逃逸学习
// R181j: 伪关联探针 (混沌矩阵十七期运行时面) — 黄金=象征层判定文本
const GOLD_SET = {
    '治理|1|band0': { gold: 'gold-shallow', text: '探针-浅陷阱: 常见但易错任务' },
    '门禁|2|band0': { gold: 'gold-conflict', text: '探针-规则冲突: 双规则矛盾裁决' },
    '共振|3|band0': { gold: 'gold-lowconf', text: '探针-低置信推演' },
    '门禁|4|band0': { gold: 'gold-symbolic', text: '探针-伪关联1: 365穴位=365天, 象征层可入/实证层禁用' },
    '门禁|5|band0': { gold: 'gold-symbolic', text: '探针-伪关联2: 70%水=70%地球, 承认巧合/不承认安排' },
    '门禁|6|band0': { gold: 'gold-symbolic', text: '探针-借名陷阱: 器官带月字≠月亮能量 (肉月旁)' },
};
export function apply(ctx) {
    const core = createCore();
    let flushedLog = 0;
    let lastPersist = 0;
    const stats = core.stats();
    // fs/tools 由 DSH 注入 (Context 类型无此属性, 按注入契约断言)
    const fsApi = ctx.fs;
    const readFile = async (rel) => {
        try {
            const t = await fsApi.resolve(rel);
            return await fsApi.readText(t);
        }
        catch {
            return null;
        }
    };
    const writeFile = async (rel, content) => {
        try {
            const t = await fsApi.resolve(rel);
            await fsApi.writeText(t, content, undefined, undefined, WPOL);
        }
        catch (e) {
            console.error('[dual-auto] write failed', rel, String(e));
        }
    };
    const loadState = async () => {
        const fpMap = new Map();
        try {
            const raw = await readFile(FP_FILE);
            if (raw) {
                const data = JSON.parse(raw);
                for (const k of Object.keys(data)) {
                    const v = data[k];
                    if (v && typeof v === 'object') {
                        const o = v;
                        fpMap.set(k, { escapes: Number(o.escapes) || 1, hits: Number(o.hits) || 0 });
                    }
                    else if (Number(v) > 0)
                        fpMap.set(k, { escapes: Number(v), hits: 0 });
                }
            }
        }
        catch { /* 坏文件 → 空集 */ }
        let statMap = {};
        try {
            const raw = await readFile(STAT_FILE);
            if (raw)
                statMap = JSON.parse(raw);
        }
        catch { /* 缺省 */ }
        const logRows = [];
        try {
            const raw = await readFile(LOG_FILE);
            if (raw) {
                for (const line of raw.split('\n').filter((l) => l.trim()).slice(-200)) {
                    try {
                        logRows.push(JSON.parse(line));
                    }
                    catch { /* 坏行 */ }
                }
            }
        }
        catch { /* 无日志 */ }
        core.restoreState(fpMap, statMap, logRows);
        flushedLog = logRows.length;
    };
    const persist = async () => {
        await writeFile(FP_FILE, JSON.stringify(core.exportFingerprints(), null, 1));
        await writeFile(STAT_FILE, JSON.stringify(core.exportStats(), null, 1));
        const old = await readFile(LOG_FILE);
        const oldLines = old ? old.split('\n').filter((l) => l.trim()) : [];
        const head = oldLines.slice(0, Math.max(0, oldLines.length - flushedLog));
        const all = head.concat(core.exportLog().map((r) => JSON.stringify(r)));
        await writeFile(LOG_FILE, all.join('\n') + (all.length ? '\n' : ''));
        flushedLog = core.exportLog().length;
    };
    const schedulePersist = () => {
        const now = Date.now();
        if (now - lastPersist < PERSIST_GAP_MS)
            return;
        lastPersist = now;
        persist().catch((e) => console.error('[dual-auto] persist failed', String(e)));
    };
    loadState().catch((e) => console.error('[dual-auto] load failed', String(e)));
    async function callModel(task, model) {
        const llm = ctx.get('llm');
        if (!llm)
            return { ok: false, error: 'llm 服务不可用' };
        try {
            const t0 = Date.now();
            let text = '';
            for await (const chunk of llm.stream({
                provider: PROVIDER,
                model,
                messages: [{ role: 'user', content: [{ type: 'text', text: String(task.text || '') }] }],
            })) {
                if (chunk.type === 'text-delta')
                    text += chunk.text ?? '';
                if (chunk.type === 'finish' && chunk.reason?.kind === 'error') {
                    return { ok: false, error: '模型调用错误: ' + (chunk.reason.failure?.message ?? 'unknown') };
                }
            }
            const s = core.stats();
            s.calls = (s.calls ?? 0) + 1;
            return { ok: true, text, ms: Date.now() - t0 };
        }
        catch (e) {
            return { ok: false, error: String(e) };
        }
    }
    async function runTask(task) {
        const rec = core.route(task);
        const wantPro = rec.decision === 'upgrade';
        let model = wantPro ? MODEL_PRO : MODEL_FLASH;
        let res = await callModel(task, model);
        let degraded = false;
        if (wantPro && !res.ok) {
            model = MODEL_FLASH;
            res = await callModel(task, MODEL_FLASH);
            degraded = Boolean(res.ok);
            if (degraded) {
                const s = core.stats();
                s.degraded = (s.degraded ?? 0) + 1;
            }
        }
        if (!res.ok) {
            // R181f: 回写调用结果字段 (与 API 面板对账), 触发持久化
            rec.model_used = model;
            rec.call_ms = undefined;
            rec.answer_len = undefined;
            schedulePersist();
            return { ...rec, call_error: res.error };
        }
        let auto_escaped = false;
        if (task.probe && rec.decision === 'direct') {
            const g = GOLD_SET[rec.fingerprint];
            if (g && res.text && !res.text.includes(g.gold)) {
                core.markEscape(task, false);
                auto_escaped = true;
            }
        }
        // R181f: 回写 model_used/call_ms/answer_len/degraded/auto_escaped 到日志行
        rec.model_used = model;
        rec.call_ms = res.ms;
        rec.answer_len = res.text?.length ?? 0;
        rec.degraded = degraded;
        rec.auto_escaped = auto_escaped;
        schedulePersist();
        return {
            ...rec,
            answer: res.text?.slice(0, 800),
            answer_truncated: Boolean(res.text && res.text.length > 800),
        };
    }
    const textRender = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 1) }];
    const routeOut = { type: 'object', additionalProperties: true, properties: { decision: { type: 'string' }, reason: { type: 'string' }, label: { type: 'string' }, fingerprint: { type: 'string' }, cost: { type: 'number' }, latency: { type: 'number' } } };
    const markOut = { type: 'object', additionalProperties: true, properties: { marked: { type: 'boolean' }, fingerprint: { type: 'string' }, escapes: { type: 'number' }, note: { type: 'string' } } };
    const runOut = { type: 'object', additionalProperties: true, properties: { decision: { type: 'string' }, reason: { type: 'string' }, fingerprint: { type: 'string' }, model_used: { type: 'string' }, degraded: { type: 'boolean' }, answer: { type: 'string' } } };
    function def(tool) {
        // 注册即 effect (Cordis 约定), 随插件卸载自动清理
        // tools 由 DSH 注入 (类型上 Context 无此属性, 按注入契约断言)
        const tools = ctx.tools;
        ctx.effect(() => tools.register(tool));
    }
    def({
        name: 'dual_model_route',
        description: '双模型 Auto 路由: 低成本直返 (flash) / 高成本升级 (pro) 决策。六判据 → 六标签; 逃逸学习指纹强制升级。仅决策, 真实调用用 dual_model_run。',
        parameters: {
            type: 'object',
            properties: {
                text: { type: 'string', description: '任务文本' },
                domain: { type: 'string', description: '任务域' },
                context_count: { type: 'number', description: '上下文数 (默认0)' },
                confidence: { type: 'number', description: '置信度 0-1 (默认1)' },
                novelty: { type: 'number', description: '新颖度 0-1 (默认0)' },
                rule_conflicts: { type: 'number', description: '规则冲突数 (默认0)' },
            },
            required: ['text'],
        },
        output: { schema: routeOut, render: textRender },
        execute(args) { return core.route(args); },
    });
    def({
        name: 'dual_model_run',
        description: '双模型 Auto 真实执行: 路由 + 真实模型调用 — direct → deepseek-v4-flash, upgrade → deepseek-v4-pro (调用失败自动降级 flash 并标注 degraded)。探针任务 (probe=true) 自动黄金对照: direct 答错 → 自动逃逸学习。',
        parameters: {
            type: 'object',
            properties: {
                text: { type: 'string', description: '任务文本' },
                domain: { type: 'string', description: '任务域 (治理/感知/记忆/门禁/共振/炼丹/炼体/因果)' },
                context_count: { type: 'number', description: '上下文数 (默认0)' },
                confidence: { type: 'number', description: '置信度 0-1 (默认1)' },
                novelty: { type: 'number', description: '新颖度 0-1 (默认0)' },
                rule_conflicts: { type: 'number', description: '规则冲突数 (默认0)' },
                probe: { type: 'boolean', description: '是否为已知难题探针' },
            },
            required: ['text'],
        },
        output: { schema: runOut, render: textRender },
        execute(args) { return runTask(args); },
    });
    def({
        name: 'dual_model_mark',
        description: '双模型 Auto 逃逸标定: 对刚直返 (direct) 的任务标定结果质量。correct=false → 指纹自动学习 + 磁盘日志行 escaped 标记回写, 同指纹下次强制升级 (pro)。',
        parameters: {
            type: 'object',
            properties: {
                text: { type: 'string', description: '原任务文本' },
                domain: { type: 'string', description: '原任务域' },
                context_count: { type: 'number', description: '原上下文数' },
                correct: { type: 'boolean', description: '直返结果是否正确' },
            },
            required: ['text', 'correct'],
        },
        output: { schema: markOut, render: textRender },
        execute(args) { return core.markEscape(args, args.correct); },
    });
    // 供宿主观测 (周检第 34 项 / 调试)
    void stats;
    void fingerprintOf;
}
