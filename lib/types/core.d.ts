export interface RouterTask {
    text?: unknown;
    domain?: unknown;
    context_count?: unknown;
    confidence?: unknown;
    novelty?: unknown;
    rule_conflicts?: unknown;
    probe?: unknown;
}
export interface EscapeEntry {
    escapes: number;
    hits: number;
}
export interface CoreOptions {
    domains?: string[];
    lenMax?: number;
    ctxMax?: number;
    confMin?: number;
    novMax?: number;
    costDirect?: number;
    costUpgrade?: number;
    latDirect?: number;
    latUpgrade?: number;
    decayHits?: number;
    logCap?: number;
}
export interface DecisionRecord {
    ts: string;
    fingerprint: string;
    decision: 'direct' | 'upgrade';
    reason: string;
    label: string;
    task_len: number;
    domain: string;
    context_count: number;
    cost: number;
    latency: number;
    probe: boolean;
    escaped?: boolean;
    model_used?: string;
    call_ms?: number;
    answer_len?: number;
    degraded?: boolean;
    auto_escaped?: boolean;
}
export interface RouterCore {
    route(task: RouterTask): DecisionRecord;
    markEscape(task: RouterTask, correct: boolean): {
        marked: boolean;
        fingerprint: string;
        escapes: number;
        note: string;
    };
    stats(): Record<string, number>;
    learned(): Array<{
        fp: string;
        escapes: number;
        hits: number;
    }>;
    log(): DecisionRecord[];
    restoreState(escaped: Map<string, EscapeEntry>, stats: Record<string, number>, log: DecisionRecord[]): void;
    exportFingerprints(): Record<string, EscapeEntry>;
    exportStats(): Record<string, number>;
    exportLog(): DecisionRecord[];
}
export declare function fingerprintOf(task: RouterTask, bands?: Array<[number, number]>): string;
export declare function judgeOf(task: RouterTask, opts: CoreOptions): string | null;
export declare function createCore(options?: CoreOptions): RouterCore;
