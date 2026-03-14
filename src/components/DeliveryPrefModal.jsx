// src/components/DeliveryPrefModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import { usePedido } from "../context/PedidoContext";

export default function DeliveryPrefModal({
  open,
  onSubmit,
  onClose,
  initialPref,
  zones = [],
}) {
  const { menu } = usePedido();

  if (!open) return null;

  // Logo centrado (toma header o footer)
  const logo =
    (menu?.logoUrl && String(menu.logoUrl)) ||
    (menu?.footerLogoUrl && String(menu.footerLogoUrl)) ||
    "";

  // Zonas desde prop o desde el menú (barrios) como respaldo
  const zonesFromMenu = Array.isArray(menu?.barrios)
    ? menu.barrios
    : Array.isArray(menu?.settings?.deliveryZones)
    ? menu.settings.deliveryZones
    : [];

  const effectiveZones =
    Array.isArray(zones) && zones.length > 0 ? zones : zonesFromMenu;

  // --------- estado del formulario ----------
  const [modo, setModo] = useState(initialPref?.modo || "");
  const [eta, setEta] = useState(initialPref?.eta || "");
  const [barrioId, setBarrioId] = useState(initialPref?.barrioId || "");
  const [barrioName, setBarrioName] = useState(initialPref?.barrioName || "");
  const [fee, setFee] = useState(Number(initialPref?.fee || 0)); // se mantiene funcional, pero NO se muestra

  useEffect(() => {
    setModo(initialPref?.modo || "");
    setEta(initialPref?.eta || "");
    setBarrioId(initialPref?.barrioId || "");
    setBarrioName(initialPref?.barrioName || "");
    setFee(Number(initialPref?.fee || 0));
  }, [initialPref, open]);

  // Ordena barrios alfabéticamente en español
  const sortedZones = useMemo(() => {
    const list = Array.isArray(effectiveZones) ? effectiveZones : [];
    return [...list].sort((a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""), "es", {
        sensitivity: "base",
        ignorePunctuation: true,
      })
    );
  }, [effectiveZones]);

  const handleChangeZone = (id) => {
    setBarrioId(id);
    const z = sortedZones.find((z) => z.id === id);
    setBarrioName(z?.name || "");
    setFee(Number(z?.fee || 0)); // guardamos internamente, no se muestra
  };

  const submit = (e) => {
    e?.preventDefault?.();

    const pref = { modo };

    if (modo === "Te lo llevamos") {
      pref.barrioId = barrioId || undefined;
      pref.barrioName = barrioName || undefined;
      pref.fee = Number.isFinite(Number(fee)) ? Number(fee) : 0; // funcional para totales
    } else if (modo === "Lo recojo") {
      if (eta) pref.eta = eta;
    }

    onSubmit?.(pref);
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl bg-white">
        {/* Header suave con el logo centrado */}
        <div className="px-5 pt-6 pb-4 bg-emerald-50 border-b border-emerald-100">
          <div className="w-full flex justify-center">
            {logo ? (
              <img src={logo} alt="Mas Campo" className="h-10 object-contain" />
            ) : (
              <div className="text-emerald-700 font-semibold">Mas Campo</div>
            )}
          </div>
          <h3 className="text-center mt-3 font-semibold text-emerald-800">
            Preferencia de entrega
          </h3>
        </div>

        {/* Contenido */}
        <form className="p-5 space-y-4" onSubmit={submit}>
          {/* Selector de modo */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setModo("Te lo llevamos")}
              className={`px-3 py-2 rounded-lg border transition ${
                modo === "Te lo llevamos"
                  ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                  : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              Te lo llevamos
            </button>
            <button
              type="button"
              onClick={() => setModo("Lo recojo")}
              className={`px-3 py-2 rounded-lg border transition ${
                modo === "Lo recojo"
                  ? "bg-emerald-100 border-emerald-300 text-emerald-800"
                  : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              Lo recoges
            </button>
          </div>

          {/* Zonas (domicilio) */}
          {modo === "Te lo llevamos" && (
            <div className="space-y-2">
              <label className="block text-sm text-gray-700">Barrio / zona</label>
              <select
                className="w-full border rounded-lg p-2 bg-white"
                value={barrioId}
                onChange={(e) => handleChangeZone(e.target.value)}
              >
                <option value="">Selecciona tu zona…</option>
                {sortedZones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ETA (recoger) */}
          {modo === "Lo recojo" && (
            <div className="space-y-2">
              <label className="block text-sm text-gray-700">
                ¿En cuántos minutos llegas? <span className="text-gray-400">(opcional)</span>
              </label>
              <input
                type="number"
                className="w-full border rounded-lg p-2"
                placeholder="Ej: 15"
                value={eta}
                onChange={(e) => setEta(e.target.value)}
              />
            </div>
          )}

          {/* Acciones */}
          <div className="flex justify-end gap-2 pt-3 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Confirmar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
