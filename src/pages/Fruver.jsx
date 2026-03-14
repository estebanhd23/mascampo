// src/pages/Fruver.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
// 🛑 Importamos role, userDoc, y loadingMenu del contexto
import { usePedido } from "../context/PedidoContext"; 
import DeliveryPrefModal from "../components/DeliveryPrefModal";
import PagoModal from "../components/PagoModal";
import PedidoModal from "../components/PedidoModal";

// 🛑 CONSTANTE DE COMPRA MÍNIMA
const MIN_ORDER_RESTAURANT = 30000; 

function fmt(n) {
  return (Number(n) || 0).toLocaleString("es-CO");
}

export default function Fruver() {
  // 🛑 Importamos loadingMenu para mostrar estado de carga
  const { menu, addPedidoPendiente, role, userDoc, loadingMenu } = usePedido(); 

  // ======================
  // Preferencia de entrega (se mantiene)
  // ======================
  const DELIVERY_SESSION_KEY = "mc_delivery_pref_session_v1";
  const deliveryZones =
    (menu?.barrios && Array.isArray(menu.barrios)
      ? menu.barrios
      : menu?.settings?.deliveryZones) || [];

  const [deliveryPref, setDeliveryPref] = useState(() => {
    try {
      const raw = sessionStorage.getItem(DELIVERY_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [showDeliveryModal, setShowDeliveryModal] = useState(!deliveryPref);

  const handleDeliveryPrefSubmit = (pref) => {
    let out = { ...pref };
    if (pref?.modo === "Te lo llevamos") {
      const z =
        (deliveryZones || []).find((z) => z.id === pref.barrioId) ||
        (deliveryZones || []).find((z) => z.name === pref.barrioName);
      if (z) out = { ...out, barrioId: z.id, barrioName: z.name, fee: Number(z.fee || 0) };
    } else {
      delete out.barrioId;
      delete out.barrioName;
      delete out.fee;
    }
    setDeliveryPref(out);
    try {
      sessionStorage.setItem(DELIVERY_SESSION_KEY, JSON.stringify(out));
    } catch {}
    setShowDeliveryModal(false);
  };

  // ======================
  // Catálogo Fruver (menu)
  // ======================
  // Solo mostrar productos activos (active !== false)
const catalog = (menu?.fruver || []).filter((p) => p?.active !== false);


  // IDs marcados en la intranet
  const seasonalIDs = useMemo(
    () => (Array.isArray(menu?.settings?.fruverSeasonal) ? menu.settings.fruverSeasonal : []),
    [menu?.settings?.fruverSeasonal]
  );

  // Lista real de temporada
  const seasonal = useMemo(() => {
    const set = new Set((seasonalIDs || []).map(String));
    return catalog.filter((p) => set.has(String(p.id)));
  }, [catalog, seasonalIDs]);

  // ===== Ajuste de ancho de tarjeta para alinear con el grid (se mantiene)
  const viewportRef = useRef(null);
  const [cardW, setCardW] = useState(0);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const compute = () => {
      const rect = el.getBoundingClientRect();
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const gap = 0.75 * rem; // gap-3 = 0.75rem
      const isLg = window.matchMedia("(min-width:1024px)").matches; // tailwind lg
      const cols = isLg ? 4 : 3;
      const w = (rect.width - gap * (cols - 1)) / cols;
      setCardW(w);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);

    const mq = window.matchMedia("(min-width:1024px)");
    const onMQ = () => compute();
    if (mq.addEventListener) mq.addEventListener("change", onMQ);
    else mq.addListener(onMQ);

    return () => {
      ro.disconnect();
      if (mq.removeEventListener) mq.removeEventListener("change", onMQ);
      else mq.removeListener(onMQ);
    };
  }, []);

  // Mapa de descuentos
  const fruverDiscounts =
    (menu?.settings?.discounts?.fruver && typeof menu.settings.discounts.fruver === "object")
      ? menu.settings.discounts.fruver
      : {};

  // ===== Buscador (se mantiene) =====
  const [q, setQ] = useState("");

  // 👇 Palabras clave para detectar búsqueda de descuentos/ofertas/promos
  const isDiscountQuery = (term) => /(descuent|ofert|promo)/i.test(term);

  const visibleCatalog = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return catalog;

    // Si el usuario busca descuentos/ofertas/promos → mostrar solo los que tienen % de descuento
    if (isDiscountQuery(term)) {
      return catalog.filter((p) => Number(fruverDiscounts[p.id] || 0) > 0);
    }

    // Búsqueda normal por nombre
    return catalog.filter((p) => (p.name || "").toLowerCase().includes(term));
  }, [catalog, q, fruverDiscounts]);

  // Carrito fruver (se mantiene)
  const [qty, setQty] = useState({});
  const setQtyClamped = (id, next) => {
    let v = Number(next);
    if (!Number.isFinite(v)) v = 0;
    v = Math.round(v);
    if (v < 0) v = 0;
    setQty((prev) => ({ ...prev, [id]: v }));
  };
  const inc = (id) => setQty((p) => ({ ...p, [id]: (Number(p[id]) || 0) + 1 }));
  const dec = (id) => setQty((p) => ({ ...p, [id]: Math.max(0, (Number(p[id]) || 0) - 1) }));

  const items = useMemo(() => {
    return catalog
      .filter((it) => (qty[it.id] || 0) > 0)
      .map((it) => {
        const q = Number(qty[it.id] || 0);
        const price = Number(it.price || 0); 
        const pct = Number(fruverDiscounts[it.id] || 0);
        
        // 🛑 LÓGICA DE PRECIO: 'price' ya contiene el precio B2B si el rol es 'restaurant'
        const effPrice = role === 'restaurant'
            ? price // Si es PRO, el precio ya viene del contexto con B2B
            : price * (1 - pct / 100); // Si es B2C, aplica el descuento estándar B2C

        const line = q * effPrice;
        return {
          id: it.id,
          name: it.name,
          unit: it.unit || "unidad",
          price: effPrice,
          qty: q,
          subtotal: line,
          lineTotal: line,
          img: it.img || "",
        };
      });
  }, [catalog, qty, fruverDiscounts, role]); 

  const subtotal = useMemo(() => items.reduce((a, x) => a + x.subtotal, 0), [items]);

  // Tarifa de domicilio (se mantiene)
  const deliveryFee = useMemo(() => {
    if (deliveryPref?.modo !== "Te lo llevamos") return 0;
    if (typeof deliveryPref.fee === "number") return deliveryPref.fee;
    const z =
      (deliveryZones || []).find((z) => z.id === deliveryPref?.barrioId) ||
      (deliveryZones || []).find((z) => z.name === deliveryPref?.barrioName);
    return Number(z?.fee || 0);
  }, [deliveryPref, deliveryZones]);

  const total = subtotal + deliveryFee;

  // 🛑 CÁLCULO DE RESTRICCIÓN B2B (MOQ)
  const isBelowMOQ = useMemo(() => {
    return role === 'restaurant' && subtotal < MIN_ORDER_RESTAURANT;
  }, [role, subtotal]);
  
  // ======================
  // Pago/Checkout
  // ======================
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const confirmFruverOrder = async (form) => {
    if (items.length === 0) {
      alert("Agrega al menos un producto 🙂");
      return;
    }
    if (!deliveryPref) {
      setShowDeliveryModal(true);
      return;
    }
    // 🛑 DOBLE CHEQUEO DE RESTRICCIÓN (Seguridad)
    if (isBelowMOQ) {
      alert(`El subtotal de $${fmt(subtotal)} no cumple con la compra mínima de $${fmt(MIN_ORDER_RESTAURANT)} para clientes PRO.`);
      return;
    }
    try {
      setSaving(true);
      const order = {
        type: "fruver",
        items: items.map(({ id, name, unit, price, qty, lineTotal }) => ({
          id,
          name,
          unit,
          price,
          qty,
          lineTotal,
        })),
        subtotal,
        deliveryFee,
        total,
        entrega: { ...form, ...(deliveryPref || {}) },
        status: "Pendiente",
        createdAt: new Date().toISOString(),
        // 🛑 GUARDAMOS EL METODO DE PAGO Y CRÉDITO
        paymentMethod: form.metodoPago, 
        creditDays: form.metodoPago === 'Crédito' ? userDoc?.credito?.cupo : undefined
      };
      await addPedidoPendiente(order);
      setQty({});
      setCheckoutOpen(false);
      setConfirmOpen(true);
    } catch (e) {
      console.error(e);
      alert("No se pudo guardar el pedido fruver");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

        /* Swipe horizontal suave + snap */
        .mc-swipe {
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior-x: contain;
          touch-action: pan-x;
        }
        .mc-snap-start { scroll-snap-align: start; }

        /* Chips compactos para badges, se ven bien en móvil */
        .mc-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 0.25rem; /* gap-1 */
        }
        .mc-chip {
          font-size: 10px; /* ~text-[10px] */
          line-height: 1;
          font-weight: 700;
          padding: 0.25rem 0.5rem; /* px-2 py-0.5 */
          border-radius: 0.375rem; /* rounded */
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        @media (min-width: 640px) { /* sm */
          .mc-chip { font-size: 12px; }
        }
      `}</style>
      
      {/* Encabezado con cambio de modo */}
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Frutas y Verduras</h1>
        <button
          type="button"
          onClick={() => setShowDeliveryModal(true)}
          className="text-xs px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
        >
          {deliveryPref
            ? `${deliveryPref.modo}${
                deliveryPref.modo === "Te lo llevamos"
                  ? deliveryPref.barrioName
                    ? ` · ${deliveryPref.barrioName} ($${fmt(deliveryFee || 0)})`
                    : ""
                  : deliveryPref.eta
                  ? ` · ${deliveryPref.eta} min`
                  : ""
              } · Cambiar`
            : "Elegir método de entrega"}
        </button>
      </header>

      {/* Buscador */}
      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar frutas o verduras… "
          className="w-full border rounded-full pl-10 pr-10 py-2 outline-none focus:ring-2 focus:ring-emerald-200"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 select-none">🔎</span>
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            aria-label="Limpiar búsqueda"
          >
            ✕
          </button>
        )}
      </div>

      {/* TEMPORADA / OFERTAS (Swipe horizontal) */}
      {seasonal.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-amber-100">🔥</span>
              Temporada & Ofertas
            </h2>
          </div>

          {/* Contenedor swipeable */}
          <div
            ref={viewportRef}
            className="overflow-x-auto scrollbar-hide rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50/70 to-transparent mc-swipe"
          >
            <div className="flex items-stretch gap-3 px-3 py-3">
              {seasonal.map((prod) => {
                const q = Number(qty[prod.id] || 0);
                const unit = prod.unit || "unidad";
                const pct = Number(fruverDiscounts[prod.id] || 0);
                const price = Number(prod.price || 0);
                const effPrice = role === 'restaurant' ? price : price * (1 - pct / 100);

                return (
                  <div
                    key={prod.id}
                    className="shrink-0 grow-0 mc-snap-start"
                    style={{ width: cardW ? `${cardW}px` : undefined }}
                  >
                    <div className="border rounded-lg overflow-hidden bg-white relative ring-1 ring-amber-100 shadow-sm hover:shadow-md">
                      {/* Imagen */}
                      <div className="w-full h-32 sm:h-40 md:h-48 bg-gray-50 overflow-hidden relative flex items-center justify-center">
                        {prod.img ? (
                          <img
                            src={prod.img}
                            alt={prod.name}
                            loading="eager"
                            className="max-h-24 sm:max-h-28 md:max-h-32 w-auto object-contain mx-auto"
                          />
                        ) : null}
                      </div>

                      <div className="p-2 sm:p-3 space-y-2">
                        {/* 👇 Badges como chips (debajo de la imagen) */}
                        <div className="mc-badges">
                          <span className="mc-chip bg-amber-500 text-white">TEMPORADA</span>
                          {pct > 0 && (
                            <span className="mc-chip bg-red-600 text-white">Dcto {pct}%</span>
                          )}
                        </div>

                        <div className="font-semibold text-xs sm:text-sm truncate">{prod.name}</div>

                        {/* Precio con tachado si hay descuento */}
                        <div className="text-[11px] sm:text-sm text-gray-600">
                          {pct > 0 && role !== 'restaurant' ? (
                            <>
                              <span className="line-through mr-1">$ {fmt(Number(prod.price_b2c || price / (1 - pct/100)))}</span>
                              <b>$ {fmt(effPrice)}</b> / {unit}
                            </>
                          ) : (
                            <>
                                <b>$ {fmt(effPrice)}</b> / {unit}
                            </>
                          )}
                        </div>

                        {/* Controles cantidad */}
                        <div className="flex items-center justify-center gap-1 sm:gap-2">
                          <button
                            type="button"
                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gray-100 hover:bg-gray-200 grid place-items-center text-base sm:text-lg"
                            onClick={() => dec(prod.id)}
                          >
                            –
                          </button>

                          <input
                            type="number"
                            step={1}
                            min={0}
                            className="w-14 sm:w-20 border p-1 sm:p-2 rounded text-center text-sm"
                            value={q}
                            onChange={(e) => setQtyClamped(prod.id, e.target.value)}
                          />

                          <button
                            type="button"
                            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gray-100 hover:bg-gray-200 grid place-items-center text-base sm:text-lg"
                            onClick={() => inc(prod.id)}
                          >
                            +
                          </button>
                        </div>

                        {q > 0 && (
                          <div className="text-[11px] sm:text-sm text-gray-700 text-center">
                            Subtotal: <b>$ {fmt(q * effPrice)}</b>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
      
      {/* 🛑 MENSAJE DE ESTADO DE CARGA/ERROR 🛑 */}
      {loadingMenu && (
        <div className="p-4 text-center text-gray-500">
          Cargando catálogo de productos...
        </div>
      )}
      
      {/* Catálogo */}
      <section>
        {/* Usamos !loadingMenu para asegurarnos de que ya terminó de cargar antes de mostrar 'No hay productos' */}
        {!loadingMenu && catalog.length === 0 ? (
          <div className="p-8 text-center bg-gray-50 rounded-lg text-sm text-gray-500">
            No se encontraron productos **fruver**. Revisa tu documento **menu/config** en Firestore.
          </div>
        ) : visibleCatalog.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">Sin resultados para “{q}”.</div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {visibleCatalog.map((prod) => {
              const qtty = Number(qty[prod.id] || 0);
              const unit = prod.unit || "unidad";

              const pct = Number(fruverDiscounts[prod.id] || 0);
              const basePrice = Number(prod.price || 0);
              const effPrice = role === 'restaurant' ? basePrice : basePrice * (1 - pct / 100);

              return (
                <div key={prod.id} className="border rounded-lg overflow-hidden bg-white relative">
                  <div className="w-full aspect-square bg-gray-100 overflow-hidden">
                    {prod.img ? (
                      <img src={prod.img} alt={prod.name} className="w-full h-full object-cover" />
                    ) : null}
                  </div>

                  <div className="p-2 sm:p-3 space-y-2">
                    {/* 👇 Badges como chips (debajo de la imagen) */}
                    <div className="mc-badges">
                      {seasonalIDs.includes(String(prod.id)) && (
                        <span className="mc-chip bg-amber-500 text-white">TEMPORADA</span>
                      )}
                      {pct > 0 && role !== 'restaurant' && (
                        <span className="mc-chip bg-red-600 text-white">Dcto {pct}%</span>
                      )}
                    </div>

                    <div className="font-semibold text-xs sm:text-sm truncate">{prod.name}</div>

                    <div className="text-[11px] sm:text-sm text-gray-600">
                        {/* Precio con tachado si hay descuento B2C O solo precio B2B */}
                      {pct > 0 && role !== 'restaurant' ? (
                        <>
                          <span className="line-through mr-1">$ {fmt(Number(prod.price_b2c || basePrice / (1 - pct/100)))}</span>
                          <b>$ {fmt(effPrice)}</b> / {unit}
                        </>
                      ) : (
                        <>
                            <b>$ {fmt(effPrice)}</b> / {unit}
                        </>
                      )}
                    </div>

                    {/* Controles cantidad — pasos de 1 */}
                    <div className="flex items-center justify-center gap-1 sm:gap-2">
                      <button
                        type="button"
                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gray-100 hover:bg-gray-200 grid place-items-center text-base sm:text-lg"
                        onClick={() => dec(prod.id)}
                      >
                        –
                      </button>

                      <input
                        type="number"
                        step={1}
                        min={0}
                        className="w-14 sm:w-20 border p-1 sm:p-2 rounded text-center text-sm"
                        value={qtty}
                        onChange={(e) => setQtyClamped(prod.id, e.target.value)}
                      />

                      <button
                        type="button"
                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gray-100 hover:bg-gray-200 grid place-items-center text-base sm:text-lg"
                        onClick={() => inc(prod.id)}
                      >
                        +
                      </button>
                    </div>

                    {qtty > 0 && (
                      <div className="text-[11px] sm:text-sm text-gray-700 text-center">
                        Subtotal: <b>$ {fmt(qtty * effPrice)}</b>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Totales */}
      <section className="max-w-3xl ml-auto space-y-1">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Subtotal</span>
          <span>$ {fmt(subtotal)}</span>
        </div>
        
        {/* 🛑 MENSAJE DE ADVERTENCIA B2B (MOQ) */}
        {isBelowMOQ && (
          <div className="p-2 mb-2 bg-red-100 border border-red-400 rounded-lg text-red-800 text-sm font-medium">
            🚨 **Mínimo PRO:** Subtotal de **$ {fmt(subtotal)}** es menor a la compra mínima de **$ {fmt(MIN_ORDER_RESTAURANT)}** para restaurantes.
          </div>
        )}
        
        {deliveryPref?.modo === "Te lo llevamos" && (
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              Domicilio
              {deliveryPref?.barrioName ? ` · ${deliveryPref.barrioName}` : ""}
            </span>
            <span>$ {fmt(deliveryFee)}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1 border-t">
          <span className="text-sm text-gray-700">Total</span>
          <span className="text-lg font-bold">$ {fmt(total)}</span>
        </div>
      </section>

      {/* CTA */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCheckoutOpen(true)}
          // 🛑 RESTRICCIÓN DEL BOTÓN POR COMPRA MÍNIMA
          disabled={saving || items.length === 0 || isBelowMOQ}
          className="px-5 py-3 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Confirmar pedido fruver"}
        </button>
      </div>

      {/* Modal de entrega */}
      <DeliveryPrefModal
        open={showDeliveryModal}
        onSubmit={handleDeliveryPrefSubmit}
        initialPref={deliveryPref || undefined}
        zones={deliveryZones}
      />

      {/* Modal de pago/datos */}
      {checkoutOpen && (
        <PagoModal
          open={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          onConfirm={confirmFruverOrder}
          total={total}
          // 🛑 PASAMOS DATA B2B AL MODAL DE PAGO
          role={role} 
          userDoc={userDoc}
        />
      )}

      {/* Modal de confirmación */}
      {confirmOpen && <PedidoModal open={confirmOpen} onClose={() => setConfirmOpen(false)} />}
    </div>
  );
}