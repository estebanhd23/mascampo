import React from "react";

export default function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  className = "",
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full px-3 py-2 rounded-lg text-sm transition-all duration-200
                 bg-transparent border border-[var(--ring)]
                 focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)]
                 ${className}`}
    />
  );
}
