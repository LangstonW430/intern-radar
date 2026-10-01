"use client";

import type { MatchFilterState } from "@/lib/matchFilters";
import { Input, Select } from "./ui/Field";

const CATEGORY_OPTIONS = [
  ["all", "All categories"],
  ["ai_ml_data", "AI / ML / Data"],
  ["swe", "Software"],
  ["hardware", "Hardware"],
  ["product", "Product"],
  ["quant", "Quant"],
  ["other", "Other"],
] as const;

const WORK_MODE_OPTIONS = [
  ["all", "Any work mode"],
  ["remote", "Remote"],
  ["hybrid", "Hybrid"],
  ["onsite", "On-site"],
  ["unknown", "Unspecified"],
] as const;

export default function MatchFilterBar({
  filters,
  onChange,
}: {
  filters: MatchFilterState;
  onChange: (next: MatchFilterState) => void;
}) {
  const set = (patch: Partial<MatchFilterState>) =>
    onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Search company or title…"
          aria-label="Search company or title"
          className="min-w-40 flex-1"
        />
        <Select
          value={filters.category}
          onChange={(e) => set({ category: e.target.value })}
          aria-label="Role category"
        >
          {CATEGORY_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          value={filters.workMode}
          onChange={(e) => set({ workMode: e.target.value })}
          aria-label="Work mode"
        >
          {WORK_MODE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          value={filters.sort}
          onChange={(e) => set({ sort: e.target.value as "score" | "newest" })}
          aria-label="Sort order"
        >
          <option value="score">Best score</option>
          <option value="newest">Newest</option>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <label className="flex items-center gap-2">
          Min score
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(filters.minScore * 100)}
            onChange={(e) => set({ minScore: Number(e.target.value) / 100 })}
            className="w-28 accent-accent"
          />
          <span className="w-6 font-mono tabular-nums text-ink">
            {Math.round(filters.minScore * 100)}
          </span>
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={filters.jdOnly}
            onChange={(e) => set({ jdOnly: e.target.checked })}
            className="accent-accent"
          />
          Has job description
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={filters.hideActioned}
            onChange={(e) => set({ hideActioned: e.target.checked })}
            className="accent-accent"
          />
          Hide already actioned
        </label>
      </div>
    </div>
  );
}
