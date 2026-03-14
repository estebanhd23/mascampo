import React from "react";

export function Skeleton({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-white/10 ${className}`}
      role="status"
      aria-label="Cargando"
    />
  );
}

export function SkeletonCardGrid({ rows = 6 }) {
  // grid responsivo de placeholders
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-2xl p-4 sm:p-6"
             style={{ background: "var(--card)", boxShadow: "var(--shadow)" }}>
          <Skeleton className="w-full h-40 mb-4" />
          <Skeleton className="w-3/4 h-4 mb-2" />
          <Skeleton className="w-2/3 h-4 mb-4" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
          </div>
        </div>
      ))}
    </div>
  );
}
