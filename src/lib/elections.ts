// 案件マスタ関連の共通定数
// Server Component / Client Component 双方からimport可能なpure module

export const STATUS_OPTIONS = [
  { value: "planning", label: "計画中" },
  { value: "recruiting", label: "募集中" },
  { value: "in_progress", label: "進行中" },
  { value: "completed", label: "完了" },
  { value: "cancelled", label: "中止" },
] as const;

export type ElectionStatus = (typeof STATUS_OPTIONS)[number]["value"];
