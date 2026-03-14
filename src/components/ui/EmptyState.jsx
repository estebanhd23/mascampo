import React from "react";
import Button from "./Button.jsx";

export default function EmptyState({
  title = "Sin datos por ahora",
  description = "Cuando haya información, aparecerá aquí.",
  actionLabel,
  onAction,
}) {
  return (
    <div
      className="rounded-2xl p-10 text-center border border-[var(--ring)]"
      style={{ background: "var(--card)", boxShadow: "var(--shadow)" }}
    >
      <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-white/5 flex items-center justify-center">
        <span className="text-xl">🗂️</span>
      </div>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-[var(--muted)] mb-4">{description}</p>
      {actionLabel && onAction ? (
        <Button onClick={onAction} size="md">{actionLabel}</Button>
      ) : null}
    </div>
  );
}
