import React from "react";
import { usePedido } from "../context/PedidoContext";

export default function PromoBanner() {
  const { menu } = usePedido();
  const promo = menu?.settings?.promo;
  if (!promo?.active) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-7xl mx-auto px-6 py-2 text-center text-amber-900 text-sm">
        <b>{promo.title || "Promoción"}</b> — {promo.message || "Cualquier bowl incluye combo 🎁"}
      </div>
    </div>
  );
}
