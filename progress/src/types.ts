export type Mode = 'analysis' | 'implementation' | 'verification';
export type Status = 'none' | 'candidate' | 'partial' | 'complete' | 'pending' | 'tested' | 'verified';
export type Scope = [string, string][];
export interface Stats {
  functions: number; document_linked: number; analysis: Record<string, number>;
  features: number; implementation: Record<string, number>; verification: Record<string, number>;
  unresolved: number; classified: number; unclassified: number; classification_rate: number;
  analysis_percent: number; implementation_percent: number | null; verification_percent: number | null;
  confidence_average: number;
}
export interface Category extends Stats {id: string; name: string}
export interface Progress {
  version: string; stats: Stats; categories: Category[]; documents: number; linked_documents: number;
  modules: number; identified_minigames?: number; scan_seconds: number; cache_hits: number; cache_misses: number;
  denominators: Record<string, string>; minigames?: Record<string, {name_ko: string}>;
  groups?: Record<string, {name: string; deps?: number; deps_complete?: number}>;
  source?: 'ghidra' | 'md'; title?: string; labels?: Record<Mode, Record<string, string>>; cards?: [string, number, string, boolean][];
  audit: {inventory_matches: boolean; indexes: {module: string; unique: number}[]; unmapped_sources: unknown[]};
}
export interface Link {path: string; line?: number; reason?: string; confidence?: number; heading?: string; excerpt?: string; state?: string; document?: string}
export interface Feature {id: string; name: string; path: string; category: string; exports: string[]; functions: string[]; implementation: Status; verification: Status; evidence: Link[]; tests: Link[]; verification_evidence: Link[]; origin: string; stub: boolean; structure?: {executable_members:number; empty_members:number; throw_only_members:number; constant_return_members:number}; assessment?: {basis:string;missing:string[];warning:string;automatic:boolean}}
export interface Issue {id: string; path: string; line: number; heading: string; text: string; functions: string[]}
export interface Document {id: string; path: string; title: string; summary: string; functions: string[]; unresolved: string[]}
export interface FunctionRecord {
  id: string; module: string; address: string; name: string; size: number;
  category: string; subgroup: string; subsystem: string; tags: string[]; confidence: number; classification: string;
  analysis: Status; implementation: Status; verification: Status; sources: Link[]; documents: Link[];
  features: string[]; unresolved: string[]; calls: string[];
  feature_details: Feature[]; issue_details: Issue[];
}
export interface TreeNode {id: string; name: string; value: number; field?: string; key?: string; state?: Status; complete?: number; partial?: number; candidate?: number; counts?: Record<string, number>; unresolved: number; address?: string; module?: string}
export interface Tree {nodes: TreeNode[]; total: number; leaf: boolean; counts: Record<string, number>; server_ms: number; scope: Scope; version: string}
