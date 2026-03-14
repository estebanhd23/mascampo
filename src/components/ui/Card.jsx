import React from "react";

export function Card({ children, className = "", style }) {
  return (
    <div
      className={`rounded-2xl p-4 sm:p-6 ${className}`}
      style={{ background: "var(--card)", boxShadow: "var(--shadow)", ...style }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, actions }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base sm:text-lg font-semibold">{title}</h2>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

export function CardContent({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}
