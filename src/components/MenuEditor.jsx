// src/components/MenuEditor.jsx
import React, { useEffect, useState } from "react";
import { usePedido } from "../context/PedidoContext";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Factories seguras
const newBowl = (name = "Nuevo bowl") => ({
  id: (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)),
  name,
  proteinasIncluidas: 1,
  toppingsIncluidos: 3,
  precio: 15000,
  img: "",
});
const newProtein = (name = "Nueva proteína") => ({
  id: (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)),
  name,
  extraPrice: 5500,
  img: "",
});
const newTopping = (name = "Nuevo topping") => ({
  id: (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)),
  name,
  extraPrice: 3000,
  img: "",
});
const newSalsa = (name = "Nueva salsa") => ({
  id: (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)),
  name,
  img: "",
});
const newBebida = (name = "Nueva bebida") => ({
  id: (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)),
  name,
  precio: 0,
  img: "",
});

const newBarrio = (name = "Nuevo barrio", fee = 0) => ({
  id: (crypto?.randomUUID?.() || Math.random().toString(36).slice(2)),
  name,
  fee: num(fee),
});

// Normaliza el documento de menú recibido desde Firestore
function normalizeMenu(m) {
  m = m || {};
  const normList = (arr, factory) =>
    (Array.isArray(arr) ? arr : []).map((x) =>
      (x && typeof x === "object") ? x : factory(String(x ?? "")) // si era string/otro, lo envuelve
    );

  return {
    ...m,
    logoUrl: m.logoUrl ?? "",
    footerLogoUrl: m.footerLogoUrl ?? "",
    heroUrl: m.heroUrl ?? "",
    tagline: m.tagline ?? "",
    bowls: normList(m.bowls, newBowl),
    proteinas: normList(m.proteinas, newProtein),
    toppings: normList(m.toppings, newTopping),
    salsas: normList(m.salsas, newSalsa),
    bebidas: normList(m.bebidas, newBebida),
    barrios: normList(m.barrios, newBarrio),
    combo: {
      price: num(m?.combo?.price ?? 7000),
      bebidas250: Array.isArray(m?.combo?.bebidas250) ? m.combo.bebidas250 : [],
    },
    settings: {
      ...(m.settings || {}),
    },
  };
}

export default function MenuEditor() {
  const { menu, setMenu, loadingMenu, role } = usePedido();
  const [local, setLocal] = useState(normalizeMenu(menu));
  const [saving, setSaving] = useState(false);

  // Si cambia el menú remoto, re-normaliza
  useEffect(() => setLocal(normalizeMenu(menu)), [menu]);

  if (role !== "admin") {
    return (
      <div className="p-6 text-sm text-gray-600">
        No tienes permisos de administrador.
      </div>
    );
  }

  if (loadingMenu) return <div className="p-6">Cargando menú…</div>;
  if (!local) return <div className="p-6">No hay datos de menú.</div>;

  // Update robusto: crea intermedios y corrige si hay tipos inesperados
  const update = (path, value) => {
    setLocal((prev) => {
      const base = normalizeMenu(prev || {});
      const copy = structuredClone(base);
      let ref = copy;
      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (ref[key] == null) {
          ref[key] = typeof path[i + 1] === "number" ? [] : {};
        } else if (typeof ref[key] !== "object") {
          ref[key] = typeof path[i + 1] === "number" ? [] : {};
        }
        ref = ref[key];
      }
      const last = path[path.length - 1];
      ref[last] = value;
      return copy;
    });
  };

  // ===== Bowls =====
  const addBowl = () => setLocal((p) => ({ ...p, bowls: [...(p.bowls || []), newBowl()] }));
  const removeBowl = (id) =>
    setLocal((p) => ({ ...p, bowls: (p.bowls || []).filter((b) => b.id !== id) }));

  // ===== Proteínas =====
  const addProtein = () =>
    setLocal((p) => ({ ...p, proteinas: [...(p.proteinas || []), newProtein()] }));
  const removeProtein = (id) =>
    setLocal((p) => ({ ...p, proteinas: (p.proteinas || []).filter((x) => x.id !== id) }));

  // ===== Toppings =====
  const addTopping = () =>
    setLocal((p) => ({ ...p, toppings: [...(p.toppings || []), newTopping()] }));
  const removeTopping = (id) =>
    setLocal((p) => ({ ...p, toppings: (p.toppings || []).filter((x) => x.id !== id) }));

  // ===== Salsas (sin precio) =====
  const addSalsa = () =>
    setLocal((p) => ({ ...p, salsas: [...(p.salsas || []), newSalsa()] }));
  const removeSalsa = (id) =>
    setLocal((p) => ({ ...p, salsas: (p.salsas || []).filter((x) => x.id !== id) }));

  // ===== Bebidas =====
  const addBebida = () =>
    setLocal((p) => ({ ...p, bebidas: [...(p.bebidas || []), newBebida()] }));
  const removeBebida = (id) =>
    setLocal((p) => ({ ...p, bebidas: (p.bebidas || []).filter((x) => x.id !== id) }));

  const saveAll = async () => {
    try {
      setSaving(true);
      await setMenu(normalizeMenu(local));
      alert("Menú guardado correctamente ✅");
    } catch (e) {
      console.error(e);
      alert("Error guardando el menú");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-10">
      <header>
        <h1 className="text-2xl font-bold">Editor de Menú</h1>
        <p className="text-gray-600">
          Administra portada, logos, bowls, proteínas, salsas, toppings y bebidas.
        </p>
      </header>

      {/* Identidad / Portada */}
      <section className="border rounded-lg p-5 space-y-4 bg-white">
        <h2 className="text-lg font-semibold">Identidad y Portada</h2>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div>
              <label className="block text-sm text-gray-700 mb-1">Logo del header (URL)</label>
              <input
                type="url"
                className="w-full border p-2 rounded"
                value={local.logoUrl ?? ""}
                onChange={(e) => update(["logoUrl"], e.target.value)}
                placeholder="https://ejemplo.com/logo.png"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">Logo del footer (URL)</label>
              <input
                type="url"
                className="w-full border p-2 rounded"
                value={local.footerLogoUrl ?? ""}
                onChange={(e) => update(["footerLogoUrl"], e.target.value)}
                placeholder="https://ejemplo.com/footer-logo.png"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">Portada / Hero (URL)</label>
              <input
                type="url"
                className="w-full border p-2 rounded"
                value={local.heroUrl ?? ""}
                onChange={(e) => update(["heroUrl"], e.target.value)}
                placeholder="https://ejemplo.com/portada.jpg"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-1">Tagline / Mensaje</label>
              <input
                className="w-full border p-2 rounded"
                value={local.tagline ?? ""}
                onChange={(e) => update(["tagline"], e.target.value)}
                placeholder="Comida fresca, al estilo Mas Campo"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="w-full aspect-video bg-gray-100 rounded overflow-hidden">
              {local.logoUrl ? (
                <img src={local.logoUrl} alt="logo" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full grid place-items-center text-gray-400 text-sm">
                  Logo header preview
                </div>
              )}
            </div>
            <div className="w-full aspect-video bg-gray-100 rounded overflow-hidden">
              {local.footerLogoUrl ? (
                <img src={local.footerLogoUrl} alt="logo footer" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full grid place-items-center text-gray-400 text-sm">
                  Logo footer preview
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Bowls */}
      <section className="border rounded-lg p-5 space-y-4 bg-white">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bowls</h2>
          <button onClick={addBowl} className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700">
            + Agregar bowl
          </button>
        </div>

        {(local.bowls ?? []).length === 0 && (
          <div className="text-sm text-gray-500">No hay bowls. Agrega uno para comenzar.</div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {(local.bowls ?? []).map((b, idx) => (
            <div key={b.id || idx} className="border rounded p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-28 h-20 bg-gray-100 rounded overflow-hidden shrink-0">
                  {b.img ? <img src={b.img} alt={b.name ?? "bowl"} className="w-full h-full object-cover" /> : null}
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-600 mb-1">Nombre</label>
                  <input
                    className="w-full border p-2 rounded"
                    value={b.name ?? ""}
                    onChange={(e) => update(["bowls", idx, "name"], e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Proteínas incl.</label>
                  <input
                    type="number"
                    className="w-full border p-2 rounded"
                    value={num(b.proteinasIncluidas)}
                    onChange={(e) => update(["bowls", idx, "proteinasIncluidas"], num(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Toppings incl.</label>
                  <input
                    type="number"
                    className="w-full border p-2 rounded"
                    value={num(b.toppingsIncluidos)}
                    onChange={(e) => update(["bowls", idx, "toppingsIncluidos"], num(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Precio base</label>
                  <input
                    type="number"
                    className="w-full border p-2 rounded"
                    value={num(b.precio)}
                    onChange={(e) => update(["bowls", idx, "precio"], num(e.target.value))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">URL imagen</label>
                <input
                  className="w-full border p-2 rounded"
                  value={b.img ?? ""}
                  onChange={(e) => update(["bowls", idx, "img"], e.target.value)}
                  placeholder="https://..."
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <small className="text-gray-500 break-all">{b.id}</small>
                <button
                  type="button"
                  onClick={() => removeBowl(b.id)}
                  className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Proteínas */}
      <section className="border rounded-lg p-5 space-y-4 bg-white">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Proteínas</h2>
          <button onClick={addProtein} className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700">
            + Agregar proteína
          </button>
        </div>

        {(local.proteinas ?? []).length === 0 && (
          <div className="text-sm text-gray-500">No hay proteínas definidas.</div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {(local.proteinas ?? []).map((p, idx) => (
            <div key={p.id || idx} className="border rounded p-4 flex gap-4">
              <div className="w-28 h-20 bg-gray-100 rounded overflow-hidden shrink-0">
                {p.img ? <img src={p.img} alt={p.name ?? "proteína"} className="w-full h-full object-cover" /> : null}
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Nombre</label>
                  <input
                    className="w-full border p-2 rounded"
                    value={p.name ?? ""}
                    onChange={(e) => update(["proteinas", idx, "name"], e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Precio extra</label>
                    <input
                      type="number"
                      className="w-full border p-2 rounded"
                      value={num(p.extraPrice)}
                      onChange={(e) => update(["proteinas", idx, "extraPrice"], num(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">URL imagen</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={p.img ?? ""}
                      onChange={(e) => update(["proteinas", idx, "img"], e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <small className="text-gray-500 break-all">{p.id}</small>
                  <button
                    type="button"
                    onClick={() => removeProtein(p.id)}
                    className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Salsas */}
      <section className="border rounded-lg p-5 space-y-4 bg-white">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Salsas (sin costo)</h2>
          <button onClick={addSalsa} className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700">
            + Agregar salsa
          </button>
        </div>

        {(local.salsas ?? []).length === 0 && (
          <div className="text-sm text-gray-500">No hay salsas definidas.</div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {(local.salsas ?? []).map((s, idx) => (
            <div key={s.id || idx} className="border rounded p-4 flex gap-4">
              <div className="w-28 h-20 bg-gray-100 rounded overflow-hidden shrink-0">
                {s.img ? <img src={s.img} alt={s.name ?? "salsa"} className="w-full h-full object-cover" /> : null}
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Nombre</label>
                  <input
                    className="w-full border p-2 rounded"
                    value={s.name ?? ""}
                    onChange={(e) => update(["salsas", idx, "name"], e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">URL imagen</label>
                  <input
                    className="w-full border p-2 rounded"
                    value={s.img ?? ""}
                    onChange={(e) => update(["salsas", idx, "img"], e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="flex items-center justify-between">
                  <small className="text-gray-500 break-all">{s.id}</small>
                  <button
                    type="button"
                    onClick={() => removeSalsa(s.id)}
                    className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Toppings */}
      <section className="border rounded-lg p-5 space-y-4 bg-white">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Toppings</h2>
          <button onClick={addTopping} className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700">
            + Agregar topping
          </button>
        </div>

        {(local.toppings ?? []).length === 0 && (
          <div className="text-sm text-gray-500">No hay toppings definidos.</div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {(local.toppings ?? []).map((t, idx) => (
            <div key={t.id || idx} className="border rounded p-4 flex gap-4">
              <div className="w-28 h-20 bg-gray-100 rounded overflow-hidden shrink-0">
                {t.img ? <img src={t.img} alt={t.name ?? "topping"} className="w-full h-full object-cover" /> : null}
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Nombre</label>
                  <input
                    className="w-full border p-2 rounded"
                    value={t.name ?? ""}
                    onChange={(e) => update(["toppings", idx, "name"], e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Precio extra</label>
                    <input
                      type="number"
                      className="w-full border p-2 rounded"
                      value={num(t.extraPrice)}
                      onChange={(e) => update(["toppings", idx, "extraPrice"], num(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">URL imagen</label>
                    <input
                      className="w-full border p-2 rounded"
                      value={t.img ?? ""}
                      onChange={(e) => update(["toppings", idx, "img"], e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <small className="text-gray-500 break-all">{t.id}</small>
                  <button
                    type="button"
                    onClick={() => removeTopping(t.id)}
                    className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bebidas */}
      <section className="border rounded-lg p-5 space-y-4 bg-white">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bebidas</h2>
          <button onClick={addBebida} className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700">
            + Agregar bebida
          </button>
        </div>

        {(local.bebidas ?? []).length === 0 && (
          <div className="text-sm text-gray-500">No hay bebidas definidas.</div>
        )}

        <div className="space-y-3">
          {(local.bebidas ?? []).map((b, idx) => (
            <div key={b.id || idx} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 border rounded">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Nombre</label>
                <input
                  className="w-full border p-2 rounded"
                  value={b.name ?? ""}
                  onChange={(e) => update(["bebidas", idx, "name"], e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-600 mb-1">Precio</label>
                <input
                  type="number"
                  className="w-full border p-2 rounded"
                  value={num(b.precio)}
                  onChange={(e) => update(["bebidas", idx, "precio"], num(e.target.value))}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs text-gray-600 mb-1">URL de imagen</label>
                <input
                  className="w-full border p-2 rounded"
                  value={b.img ?? ""}
                  onChange={(e) => update(["bebidas", idx, "img"], e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end md:col-span-4">
                <button
                  type="button"
                  className="px-3 py-2 bg-red-600 text-white rounded"
                  onClick={() => removeBebida(b.id)}
                >
                  Eliminar bebida
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* === BARRIOS / ZONAS DE DOMICILIO === */}
      <section className="border rounded-lg p-5 space-y-4 bg-white">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Barrios / Zonas (domicilio)</h2>
          <button
            type="button"
            onClick={() => setLocal((p) => ({ ...p, barrios: [...(p.barrios || []), newBarrio()] }))}
            className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700"
          >
            + Agregar barrio
          </button>
        </div>

        {(!local.barrios || local.barrios.length === 0) && (
          <div className="text-sm text-gray-500">No hay barrios definidos.</div>
        )}

        <div className="space-y-3">
          {(local.barrios || []).map((b, idx) => (
            <div key={b.id || idx} className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 border rounded">
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-600 mb-1">Nombre del barrio</label>
                <input
                  className="w-full border p-2 rounded"
                  value={b.name ?? ""}
                  onChange={(e) => update(["barrios", idx, "name"], e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Tarifa (COP)</label>
                <input
                  type="number"
                  className="w-full border p-2 rounded"
                  value={num(b.fee)}
                  onChange={(e) => update(["barrios", idx, "fee"], num(e.target.value))}
                />
              </div>

              <div className="md:col-span-3 flex items-center justify-between">
                <small className="text-gray-500 break-all">{b.id}</small>
                <button
                  type="button"
                  className="px-3 py-2 bg-red-600 text-white rounded"
                  onClick={() =>
                    setLocal((p) => ({
                      ...p,
                      barrios: (p.barrios || []).filter((x) => x.id !== b.id),
                    }))
                  }
                >
                  Eliminar barrio
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Guardar */}
      <div className="flex justify-end">
        <button
          onClick={saveAll}
          disabled={saving}
          className={`px-4 py-2 rounded text-white ${saving ? "bg-emerald-400" : "bg-emerald-600 hover:bg-emerald-700"}`}
        >
          {saving ? "Guardando…" : "Guardar menú"}
        </button>
      </div>
    </div>
  );
}
