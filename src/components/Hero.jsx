import React from "react";
import { usePedido } from "../context/PedidoContext";

export default function Hero() {
  const { menu } = usePedido();
  const src = menu?.heroUrl || "";
  const tagline = menu?.tagline || "";

  if (!src) return null;

  return (
    <div className="mb-6">
      <div className="w-full rounded-2xl overflow-hidden">
        <img
          src={src}
          alt="Mas Campo portada"
          className="w-full h-auto object-cover"
          style={{ display: "block" }}
        />
      </div>
      {tagline ? (
        <p className="mt-3 text-center text-gray-700">{tagline}</p>
      ) : null}
      {/* Línea sutil separadora */}
      <div className="mt-5 h-px bg-gray-200/60" />
    </div>
  );
}
