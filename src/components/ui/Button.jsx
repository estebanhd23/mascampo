// src/components/ui/button.jsx
import React from "react";

export function Button({
  children,
  onClick,
  className = "",
  size = "md",
  type = "button",
  disabled = false,
}) {
  const sizeClasses =
    size === "sm"
      ? "px-3 py-1.5 text-sm"
      : size === "lg"
      ? "px-5 py-3 text-base"
      : "px-4 py-2 text-sm";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors ${sizeClasses} ${className}`}
    >
      {children}
    </button>
  );
}
