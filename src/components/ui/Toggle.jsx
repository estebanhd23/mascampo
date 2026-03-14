import React from "react";

export default function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 select-none cursor-pointer">
      <span className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange?.(e.target.checked)}
          className="sr-only"
        />
        <span
          className={`block w-10 h-6 rounded-full transition-all duration-200
                      ${checked ? "bg-[var(--primary)]" : "bg-gray-500/40"}`}
        />
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-all duration-200
                      ${checked ? "translate-x-4" : ""}`}
        />
      </span>
      {label ? (
        <span className={checked ? "text-emerald-500 text-sm" : "text-red-500 text-sm"}>
          {label}
        </span>
      ) : null}
    </label>
  );
}
