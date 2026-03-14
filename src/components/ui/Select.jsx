import React from "react";

export default function Select({ value, onChange, children, className = "" }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className={`w-full px-3 py-2 rounded-lg text-sm bg-transparent
                  border border-[var(--ring)]
                  focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)]
                  ${className}`}
    >
      {children}
    </select>
  );
}
