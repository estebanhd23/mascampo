// src/pages/Cliente.jsx
import React, { useMemo, useState, useEffect } from "react";
import { usePedido } from "../context/PedidoContext";
import ProteinSelector from "../components/ProteinSelector";
import ToppingSelector from "../components/ToppingSelector";
import SauceSelector from "../components/SauceSelector";
import ComboSelector from "../components/ComboSelector";
import BebidaSelector from "../components/BebidaSelector";
import PedidoResumen from "../components/PedidoResumen";
import PagoModal from "../components/PagoModal";
import PedidoModal from "../components/PedidoModal";
import ExtrasModal from "../components/ExtrasModal";
import DeliveryPrefModal from "../components/DeliveryPrefModal";
import HowToBowlModal from "../components/HowToBowlModal";


// ====== helpers de horario (mismos que intranet) ======
const BOGOTA_TZ = "America/Bogota";
function getBogotaParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("es-CO", {
    timeZone: BOGOTA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const hour = Number(get("hour") || 0);
  const minute = Number(get("minute") || 0);
  const wraw = (get("weekday") || "").toLowerCase();
  const map = { lun: "mon", mar: "tue", mie: "wed", jue: "thu", vie: "fri", sab: "sat", dom: "sun" };
  const wnorm = wraw.normalize("NFD").replace(/[\u0300-\u036f.]/g, "").slice(0, 3);
  const dayKey = map[wnorm] || "mon";
  return { hour, minute, dayKey };
}
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const prevDay = (key) => DAY_ORDER[(DAY_ORDER.indexOf(key) + 6) % 7];
const hmToMin = (s) => {
  const m = String(s || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mi = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return h * 60 + mi;
};
function isOpenBySchedule(schedule = {}, d = new Date()) {
  const { hour, minute, dayKey } = getBogotaParts(d);
  const now = hour * 60 + minute;
  const today = schedule[dayKey] || {};
  const yKey = prevDay(dayKey);
  const yesterday = schedule[yKey] || {};
  const tOpen = hmToMin(today.open);
  const tClose = hmToMin(today.close);
  const yOpen = hmToMin(yesterday.open);
  const yClose = hmToMin(yesterday.close);
  if (today.closed === true) {
    if (yOpen != null && yClose != null && yOpen > yClose && now < (yClose ?? 0) && yesterday.closed !== true) return true;
    return false;
  }
  if (tOpen == null || tClose == null) return false;
  if (tOpen < tClose) return now >= tOpen && now < tClose;
  if (tOpen > tClose) return now >= tOpen || now < tClose;
  return false;
}

export default function Cliente() {
  const { menu, addPedidoPendiente } = usePedido();

  // ===== Modal educativo (una vez) =====
  const HOWTO_KEY = "mc_howto_seen_v1";
  const [howToOpen, setHowToOpen] = useState(false);
  useEffect(() => {
    try {
      const seen = localStorage.getItem(HOWTO_KEY) === "1";
      if (!seen) setHowToOpen(true);
    } catch {
      setHowToOpen(true);
    }
  }, []);
  const closeHowTo = (dontShowAgain) => {
    if (dontShowAgain) {
      try { localStorage.setItem(HOWTO_KEY, "1"); } catch {}
    }
    setHowToOpen(false);
  };

  // ===== Gate automático según horario/override =====
  useEffect(() => {
    const check = () => {
      const settings = menu?.settings || {};
      const override = settings.storeOverride || null; // 'open' | 'closed' | null
      const hours = settings.storeHours || {};
      const isOpen = override === "open" ? true : override === "closed" ? false : isOpenBySchedule(hours, new Date());
      if (!isOpen && typeof window !== "undefined") {
        try { window.location.assign("../components/StoreHoursGate.jsx"); } catch { window.location.href = "../components/StoreHoursGate.jsx"; }
      }
    };
    check();
    const id = setInterval(check, 30 * 1000);
    return () => clearInterval(id);
  }, [menu?.settings?.storeHours, menu?.settings?.storeOverride]);

  // ===== Preferencia de entrega (una vez por sesión) =====
  const DELIVERY_SESSION_KEY = "mc_delivery_pref_session_v1";
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
    if (!pref) return;
    setDeliveryPref(pref);
    try {
      sessionStorage.setItem(DELIVERY_SESSION_KEY, JSON.stringify(pref));
    } catch {}
    setShowDeliveryModal(false);
  };

  // ===== Estado de armado =====
  // {bowlId, proteinas:{}, toppings:{}, salsas:{}, bebidas:{}, bebidaId, combo, comboBebidaId, comboSnackId}
  const [current, setCurrent] = useState(null);
  const [cart, setCart] = useState([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const money = (n) => Number(n || 0).toLocaleString("es-CO");
  const fmt = (n) => (typeof n === "number" ? n.toLocaleString() : "0");

  // Defaults seguros del menú
  const bowlsArr     = Array.isArray(menu?.bowls) ? menu.bowls : [];
  const bebidasArr   = Array.isArray(menu?.bebidas) ? menu.bebidas : [];
  const proteinasArr = Array.isArray(menu?.proteinas) ? menu.proteinas : [];
  const toppingsArr  = Array.isArray(menu?.toppings) ? menu.toppings : [];
  const comboPrice   = Number(menu?.combo?.price ?? 7000);
  const comboSnacks  = Array.isArray(menu?.combo?.snacks) ? menu.combo.snacks : [];

  // 👇 Mapa de descuentos (bowls) desde la intranet
  const bowlDiscounts =
    (menu?.settings?.discounts?.bowls && typeof menu.settings.discounts.bowls === "object")
      ? menu.settings.discounts.bowls
      : {};

  // Modal de extras
  const [extrasModal, setExtrasModal] = useState({
    open: false,
    type: null, // 'protein' | 'topping'
    included: 0,
    currentCount: 0,
    extraPrice: 0,
    onProceed: null,
    nextKey: null,
  });
  const [ackExtras, setAckExtras] = useState({ protein: false, topping: false });

  // 👇 NUEVO: modal informativo cuando hay combo y eligen bebida suelta — solo 1 vez por sesión
  const EXTRA_DRINK_SEEN_KEY = "mc_seen_extra_drink_info_v1";
  const [extraDrinkInfoOpen, setExtraDrinkInfoOpen] = useState(false);
  const [extraDrinkInfoSeen, setExtraDrinkInfoSeen] = useState(() => {
    try {
      return sessionStorage.getItem(EXTRA_DRINK_SEEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const showExtraDrinkInfoOnce = () => {
    if (extraDrinkInfoSeen) return;
    setExtraDrinkInfoOpen(true);
    setExtraDrinkInfoSeen(true);
    try { sessionStorage.setItem(EXTRA_DRINK_SEEN_KEY, "1"); } catch {}
  };

  // Control del acordeón y auto-avance
  const [openKey, setOpenKey] = useState("proteina");
  const [autoAdvance, setAutoAdvance] = useState(true);

  const startBowl = (bowlId) => {
    setCurrent({
      bowlId,
      proteinas: {},
      toppings: {},
      salsas: {},
      bebidas: {},      // 👈 cantidades por bebida
      bebidaId: "",     // 👈 compatibilidad (primera bebida seleccionada)
      combo: false,
      comboBebidaId: "",
      comboSnackId: "",
    });
    setAckExtras({ protein: false, topping: false });
    setOpenKey("proteina");
    setAutoAdvance(true);
  };
  const resetCurrent = () => setCurrent(null);

  const bowlDef = useMemo(
    () => (current ? bowlsArr.find((x) => x.id === current.bowlId) || null : null),
    [current, bowlsArr]
  );

  const counts = useMemo(() => {
    const totalProte = Object.values(current?.proteinas || {}).reduce((a, c) => a + c, 0);
    const totalTops = Object.values(current?.toppings || {}).reduce((a, c) => a + c, 0);
    const totalSalsas = Object.values(current?.salsas || {}).reduce((a, c) => a + c, 0);
    const incP = Number(bowlDef?.proteinasIncluidas ?? 0);
    const incT = Number(bowlDef?.toppingsIncluidos ?? 0);
    const extraP = Math.max(0, totalProte - incP);
    const extraT = Math.max(0, totalTops - incT);
    return { totalProte, totalTops, totalSalsas, incP, incT, extraP, extraT };
  }, [current, bowlDef]);

  // ===== Precios =====
  const priceFor = (bowlState) => {
    if (!bowlState || !bowlDef) return 0;

    // base con descuento si aplica
    const rawBase = Number(bowlDef?.precio ?? 0);
    const pct = Number(bowlDiscounts[bowlState?.bowlId] || 0);
    const base = rawBase * (1 - (pct / 100));

    const totP = Object.values(bowlState.proteinas || {}).reduce((a, c) => a + c, 0);
    const totT = Object.values(bowlState.toppings || {}).reduce((a, c) => a + c, 0);
    const extrasProte = Math.max(0, totP - Number(bowlDef?.proteinasIncluidas ?? 0));
    const extrasTops = Math.max(0, totT - Number(bowlDef?.toppingsIncluidos ?? 0));

    const protExtraPrice = Number(proteinasArr?.[0]?.extraPrice ?? 5500);
    const topExtraPrice  = Number(toppingsArr?.[0]?.extraPrice ?? 3000);

    const costoExtrasProte = extrasProte * protExtraPrice;
    const costoExtrasTops  = extrasTops * topExtraPrice;

    const costoCombo = bowlState.combo ? comboPrice : 0;

    // 👇 Sumatoria de bebidas sueltas (pueden ser varias y con cantidad)
    const bebidasMap = bowlState.bebidas || {};
    const bebidasTotal = Object.entries(bebidasMap).reduce((acc, [id, q]) => {
      const price = Number(bebidasArr.find((x) => x.id === id)?.precio ?? 0);
      const qty = Math.max(0, Number(q) || 0);
      return acc + price * qty;
    }, 0);

    return base + costoExtrasProte + costoExtrasTops + costoCombo + bebidasTotal;
  };

  const currentPrice = useMemo(
    () => priceFor(current),
    [current, bowlDef, bebidasArr, proteinasArr, toppingsArr, comboPrice, menu]
  );

  // Subtotal mostrado (carrito + bowl en curso)
  const cartSubtotal = useMemo(() => {
    if (!Array.isArray(cart)) return 0;
    return cart.reduce((acc, item) => {
      const p = Number(item?.price ?? 0);
      return acc + (Number.isFinite(p) ? p : 0);
    }, 0);
  }, [cart]);
  const displaySubtotal = cartSubtotal + (current ? Number(currentPrice || 0) : 0);

    // Tarifa de domicilio (si aplica)
  const deliveryFee = useMemo(() => {
    const pref = deliveryPref;
    if (pref?.modo !== "Te lo llevamos") return 0;
    const fee = Number(pref?.fee || 0);
    return Number.isFinite(fee) ? fee : 0;
  }, [deliveryPref]);

// === Código promocional (desde Intranet) ===
const promoMap = (menu?.settings?.promoCodes && typeof menu.settings.promoCodes === "object")
  ? menu.settings.promoCodes
  : {};

const [promoInput, setPromoInput] = useState("");
const [appliedCode, setAppliedCode] = useState("");

// % según código aplicado (case-insensitive)
const promoPct = useMemo(() => {
  const key = String(appliedCode || "").trim().toUpperCase();
  return Number(promoMap[key] || 0);
}, [appliedCode, promoMap]);

// Descuento aplicado sobre el SUBTOTAL visible (sin domicilio)
const promoDiscount = useMemo(() => {
  if (!promoPct) return 0;
  const d = Math.floor((displaySubtotal * promoPct) / 100);
  return d > 0 ? d : 0;
}, [displaySubtotal, promoPct]);

// Totales con descuento y domicilio
const cartTotal    = Math.max(0, cartSubtotal - Math.floor((cartSubtotal * promoPct) / 100) + deliveryFee);
const displayTotal = Math.max(0, displaySubtotal - promoDiscount + deliveryFee);

// aplicar / quitar código
const applyPromo = () => {
  const key = String(promoInput || "").trim().toUpperCase();
  if (!key) return;
  if (!promoMap[key]) {
    alert("Código inválido o inactivo");
    return;
  }
  setAppliedCode(key);
  alert(`Código aplicado: ${key} (${promoMap[key]}%)`);
};
const clearPromo = () => {
  setAppliedCode("");
  setPromoInput("");
};




  const addBowlToCart = () => {
    if (!current) return;
    const price = Number(currentPrice || 0);
    const safe = {
      ...current,
      price: Number.isFinite(price) ? price : 0,
    };
    setCart((prev) => (Array.isArray(prev) ? [...prev, safe] : [safe]));
    resetCurrent();
  };

  // ===== Modal de extras =====
  const openExtras = ({ type, included, currentCount, onProceed }) => {
    const extraPrice =
      type === "protein"
        ? Number(proteinasArr?.[0]?.extraPrice ?? 5500)
        : Number(toppingsArr?.[0]?.extraPrice ?? 3000);
    const nextKey = type === "protein" ? "topping" : "salsa"; // si NO desea extras
    setExtrasModal({ open: true, type, included, currentCount, extraPrice, onProceed, nextKey });
  };
  const closeExtras = () =>
    setExtrasModal({
      open: false,
      type: null,
      included: 0,
      currentCount: 0,
      extraPrice: 0,
      onProceed: null,
      nextKey: null,
    });

  const confirmExtras = () => {
    setAckExtras((p) => ({ ...p, [extrasModal.type]: true })); // ya aceptó cobro
    extrasModal.onProceed?.(); // suma el extra
    closeExtras(); // permanece en el paso actual
  };
  const cancelExtras = () => {
    if (extrasModal.nextKey) {
      setAutoAdvance(false);
      setOpenKey(extrasModal.nextKey); // sigue flujo sin extra
    }
    closeExtras();
  };

  // ===== Encabezados =====
  const proteHeader = useMemo(() => {
    if (!bowlDef) return "Proteínas";
    const extraTxt = counts.extraP > 0 ? ` (+${counts.extraP} extra)` : "";
    return `Proteínas · ${counts.totalProte}/${counts.incP}${extraTxt}`;
  }, [counts, bowlDef]);

  const toppingHeader = useMemo(() => {
    if (!bowlDef) return "Toppings";
    const extraTxt = counts.extraT > 0 ? ` (+${counts.extraT} extra)` : "";
    return `Toppings · ${counts.totalTops}/${counts.incT}${extraTxt}`;
  }, [counts, bowlDef]);

  const salsaHeader = useMemo(() => `Salsas · ${counts.totalSalsas}`, [counts.totalSalsas]);

  const comboHeader = useMemo(() => {
    if (!current) return "¿Quieres combo?";
    if (current.combo) return `¿Quieres combo? · Sí (+$${fmt(comboPrice)})`;
    // Mantengo compatibilidad mostrando la primera bebida si existe
    if (!current.combo && current.bebidaId) {
      const b = bebidasArr.find((x) => x.id === current.bebidaId);
      return `Bebida suelta · ${b?.name || "Elegida"} ($${fmt(b?.precio || 0)})`;
    }
    return "¿Quieres combo?";
  }, [current, comboPrice, bebidasArr]);

  const bebidaHeader = useMemo(() => {
    if (!current) return "Bebidas";
    const totalBebidas = Object.values(current?.bebidas || {}).reduce((a, c) => a + Number(c || 0), 0);
    if (totalBebidas > 0) return `Bebidas · ${totalBebidas} seleccionadas`;
    if (current.bebidaId) return "Bebidas · 1 seleccionada"; // compatibilidad
    return "Bebidas";
  }, [current]);

  // ===== Reglas de visualización y auto-avance =====
  const countsIncP = Number(bowlDef?.proteinasIncluidas ?? 0);
  const countsIncT = Number(bowlDef?.toppingsIncluidos ?? 0);
  const canShowToppings = counts.totalProte >= countsIncP;
  const canShowSalsas   = counts.totalTops  >= countsIncT;

  useEffect(() => {
    if (!autoAdvance) return;
    if (!current || extrasModal.open) return;
    if (openKey === "proteina" && counts.totalProte === countsIncP) {
      setOpenKey("topping");
    }
  }, [current, counts.totalProte, countsIncP, openKey, extrasModal.open, autoAdvance]);

  useEffect(() => {
    if (!autoAdvance) return;
    if (!current || extrasModal.open) return;
    if (openKey === "topping" && counts.totalTops === countsIncT) {
      setOpenKey("salsa");
    }
  }, [current, counts.totalTops, countsIncT, openKey, extrasModal.open, autoAdvance]);

  // Limpia snack si apagan el combo
  useEffect(() => {
    if (current && current.combo === false && current.comboSnackId) {
      setCurrent((p) => ({ ...p, comboSnackId: "" }));
    }
  }, [current?.combo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper para abrir panel manualmente (desactiva auto-avance)
  const openPanel = (key) => {
    setAutoAdvance(false);
    setOpenKey(key);
  };

  // ===== Confirmar pedido =====
  const cartSubtotalMemo = cartSubtotal; // solo alias
  const confirmOrder = async (form) => {
    try {
const order = {
  items: cart,
  subtotal: cartSubtotalMemo,
  deliveryFee,
  total: cartTotal,
  entrega: { ...form, ...(deliveryPref || {}) },
  status: "Pendiente",
  createdAt: new Date().toISOString(),
  pricing: {
    subtotal: cartSubtotalMemo,
    promoCode: appliedCode || null,
    promoPercent: promoPct || 0,
    promoDiscount: Math.floor((cartSubtotalMemo * promoPct) / 100),
    total: cartTotal,
  },
};

      await addPedidoPendiente(order);
      setConfirmOpen(true);
      setCart([]);
      resetCurrent();
      setCheckoutOpen(false);
   } catch (error) {
  console.error("Error al guardar pedido:", error); // <--- Esto te mostrará el error real en la consola (F12)
  alert(`No se pudo guardar el pedido: ${error.message}`);
}
  };

  return (
    <>
      {/* CSS local */}
      <style>{`
        /* Oculta imágenes solo en proteínas/toppings/salsas */
        .mc-no-photos .aspect-video { display: none !important; }
        .mc-no-photos img { display: none !important; }

        /* 👇 Arreglo visual para imágenes de BEBIDAS (sin recortes) */
        .mc-beverages img{
          width: 100%;
          height: 100%;
          object-fit: contain !important;
          object-position: center;
          padding: 8px;
          background: #f8fafc;
          border-radius: 0.5rem;
        }
      `}</style>

      <div className="max-w-7xl mx-auto p-6">
        <header className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Arma tu Bowl</h1>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHowToOpen(true)}
              className="text-xs underline text-gray-600 hover:text-gray-900"
            >
              ¿Cómo armar un bowl?
            </button>

            <button
              type="button"
              onClick={() => setShowDeliveryModal(true)}
              className="text-xs px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
            >
              {deliveryPref
                ? `${deliveryPref.modo}${
                    deliveryPref.modo === "Te lo llevamos"
                      ? deliveryPref.barriosName
                        ? ` · ${deliveryPref.barriosName}`
                        : ""
                      : deliveryPref.eta
                      ? ` · ${deliveryPref.eta} min`
                      : ""
                  } · Cambiar`
                : "Elegir método de entrega"}
            </button>
          </div>
        </header>

        <main className="grid lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 space-y-6">
            {/* Bowls - grandes y centrados */}
            {!current && (
              <div className="max-w-3xl mx-auto">
                <h2 className="font-semibold mb-3 text-center">Elige tu bowl</h2>
                <div className="space-y-4">
                  {(Array.isArray(menu?.bowls) ? menu.bowls : []).map((b, idx) => {
                    const pct = Number(bowlDiscounts[b?.id] || 0);
                    const effBase = Number(b?.precio || 0) * (1 - (pct / 100));
                    return (
                      <div key={b?.id ?? `bowl-${idx}`} className="border rounded-xl p-4 bg-white shadow-sm">
                        <div className="flex gap-4 items-center">
                          <div className="w-28 h-24 bg-gray-100 rounded-lg overflow-hidden shrink-0 relative">
                            {/* Badge descuento */}
                            {pct > 0 && (
                              <div className="absolute top-1 left-1 z-10">
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded">
                                  DESCUENTO {pct}%
                                </span>
                              </div>
                            )}
                            {b?.img ? <img src={b.img} alt={b.name} className="w-full h-full object-cover" /> : null}
                          </div>
                          <div className="flex-1">
                            <div className="flex flex-wrap items-end justify-between gap-2">
                              <div>
                                <div className="text-lg font-semibold">{b?.name}</div>
                                <div className="text-xs text-gray-500">
                                  Prot. incl.: {b?.proteinasIncluidas ?? 0} • Top. incl.: {b?.toppingsIncluidos ?? 0}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm text-gray-500">Desde</div>
                                {pct > 0 ? (
                                  <>
                                    <div className="text-xs text-gray-400 line-through">
                                      ${money(Number(b?.precio || 0))}
                                    </div>
                                    <div className="text-xl font-bold">
                                      ${money(effBase)}
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-xl font-bold">
                                    ${money(Number(b?.precio || 0))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="mt-3">
                              <button
                                className="w-full sm:w-auto px-5 py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700"
                                onClick={() => startBowl(b?.id)}
                              >
                                Elegir
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Construcción */}
            {current && (
              <div className="space-y-4">
                <h2 className="font-semibold">Armando: {bowlDef?.name}</h2>

                {/* Proteínas (sin fotos) */}
                <div className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 bg-gray-50 font-medium"
                    onClick={() => openPanel("proteina")}
                  >
                    <div className="flex flex-col">
                      <span>{proteHeader}</span>
                      <span className="text-xs text-gray-500">
                        Incluidas: {counts.incP} · Seleccionadas: {counts.totalProte}
                      </span>
                    </div>
                  </button>
                  {openKey === "proteina" && (
                    <div className="p-3 mc-no-photos">
                      <ProteinSelector
                        current={current}
                        setCurrent={setCurrent}
                        menu={menu}
                        ackExtras={ackExtras.protein}
                        onNeedExtras={(included, currentCount, proceed) =>
                          openExtras({ type: "protein", included, currentCount, onProceed: proceed })
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Toppings (sin fotos) */}
                {canShowToppings && (
                  <div className="border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      className="w-full text-left px-4 py-3 bg-gray-50 font-medium"
                      onClick={() => openPanel("topping")}
                    >
                      <div className="flex flex-col">
                        <span>{toppingHeader}</span>
                        <span className="text-xs text-gray-500">
                          Incluidos: {counts.incT} · Seleccionados: {counts.totalTops}
                        </span>
                      </div>
                    </button>
                    {openKey === "topping" && (
                      <div className="p-3 mc-no-photos">
                        <ToppingSelector
                          current={current}
                          setCurrent={setCurrent}
                          menu={menu}
                          ackExtras={ackExtras.topping}
                          onNeedExtras={(included, currentCount, proceed) =>
                            openExtras({ type: "topping", included, currentCount, onProceed: proceed })
                          }
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Salsas (sin fotos) */}
                {canShowSalsas && (
                  <div className="border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      className="w-full text-left px-4 py-3 bg-gray-50 font-medium"
                      onClick={() => openPanel("salsa")}
                    >
                      <div className="flex flex-col">
                        <span>{salsaHeader}</span>
                        <span className="text-xs text-gray-500">Sin costo. Puedes elegir varias.</span>
                      </div>
                    </button>
                    {openKey === "salsa" && (
                      <div className="p-3 mc-no-photos">
                        <SauceSelector current={current} setCurrent={setCurrent} menu={menu} />
                      </div>
                    )}
                  </div>
                )}

                {/* Combo — SIEMPRE visible */}
                {canShowSalsas && (
                  <div className="border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      className="w-full text-left px-4 py-3 bg-gray-50 font-medium"
                      onClick={() => openPanel("combo")}
                    >
                      <div className="flex flex-col">
                        <span>{comboHeader}</span>
                        <span className="text-xs text-gray-500">
                          {current?.combo ? "Incluye chips + bebida 250ml" : "El combo suma $" + fmt(comboPrice)}
                        </span>
                      </div>
                    </button>
                    {openKey === "combo" && (
                      <div className="p-3">
                        <ComboSelector current={current} setCurrent={setCurrent} menu={menu} />

                        {/* Snack del combo */}
                        {current?.combo && (comboSnacks?.length || 0) > 0 && (
                          <div className="mt-3">
                            <h5 className="font-medium mb-2">Snack del combo</h5>
                            <div className="flex gap-3 flex-wrap">
                              {comboSnacks.map((s) => (
                                <label key={s.id} className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name="comboSnack"
                                    checked={current?.comboSnackId === s.id}
                                    onChange={() =>
                                      setCurrent((p) => ({ ...p, comboSnackId: s.id }))
                                    }
                                  />
                                  {s.name}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Bebidas (CON fotos) */}
                {canShowSalsas && (
                  <div className="border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      className="w-full text-left px-4 py-3 bg-gray-50 font-medium"
                      onClick={() => openPanel("bebida")}
                    >
                      <div className="flex flex-col">
                        <span>{bebidaHeader}</span>
                        <span className="text-xs text-gray-500">Elige las bebidas que quieras 💚</span>
                      </div>
                    </button>
                    {openKey === "bebida" && (
                      <div className="p-3 mc-beverages">
                        <BebidaSelector
                          current={current}
                          setCurrent={setCurrent}
                          menu={menu}
                          onExtraDrinkWhileCombo={() => {
                            if (current?.combo) showExtraDrinkInfoOnce();
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
       


                {/* Totales */}
                <div className="space-y-1">
  <div className="flex justify-between items-center text-sm text-gray-600">
    <span>Subtotal</span>
    <span>${fmt(displaySubtotal)}</span>
  </div>

  {promoDiscount > 0 && (
    <div className="flex justify-between items-center text-sm text-red-600">
      <span>Promo {appliedCode ? `(${appliedCode} · ${promoPct}%)` : ""}</span>
      <span>- ${fmt(promoDiscount)}</span>
    </div>
  )}

  {deliveryFee > 0 && (
    <div className="flex justify-between items-center text-sm text-gray-600">
      <span>
        Domicilio {deliveryPref?.barriosName ? `(${deliveryPref.barriosName})` : ""}
      </span>
      <span>${fmt(deliveryFee)}</span>
    </div>
  )}

  <div className="flex justify-between items-center pt-1 border-t">
    <div className="text-sm text-gray-600">Total</div>
    <div className="font-bold">${fmt(displayTotal)}</div>
  </div>
</div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    className="px-4 py-3 bg-emerald-600 text-white rounded w-full"
                    onClick={() => {
                      addBowlToCart();
                    }}
                  >
                    Pedir otro bowl
                  </button>
                  <button
                    className="px-4 py-3 bg-red-600 text-white rounded w-full"
                    onClick={() => {
                      addBowlToCart();
                      setCheckoutOpen(true);
                    }}
                  >
                    Seguir a pagar
                  </button>
                </div>

                <div>
                  <button className="mt-2 text-sm text-gray-600 underline" onClick={resetCurrent}>
                    Cancelar este bowl y volver
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Código promocional (visible si hay bowl en curso o items en el carrito) */}
{(current || (cart?.length || 0) > 0) && (
  <div className="border rounded-lg overflow-hidden">
    <div className="px-4 py-3 bg-gray-50 font-medium">Código promocional</div>
    <div className="p-3 flex gap-2 flex-col sm:flex-row">
      <input
        className="flex-1 border rounded-lg p-2 uppercase"
        placeholder="INGRESA TU CÓDIGO"
        value={promoInput}
        onChange={(e) => setPromoInput(e.target.value)}
        disabled={!!appliedCode}
      />
      {!appliedCode ? (
        <button
          onClick={applyPromo}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Aplicar
        </button>
      ) : (
        <button
          onClick={clearPromo}
          className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
        >
          Quitar {appliedCode}
        </button>
      )}
    </div>
  </div>
)}


          {/* Resumen lateral solo cuando hay algo */}
          <aside className="p-4 border rounded h-fit sticky top-4 hidden lg:block">
            {(current || (cart?.length || 0) > 0) && (
              <>
                <PedidoResumen cart={cart} current={current} currentPrice={currentPrice} />
<div className="mt-2 text-sm text-gray-600 space-y-0.5">
  <div>Subtotal: ${fmt(displaySubtotal)}</div>
  {promoDiscount > 0 && (
    <div className="text-red-600">Promo {appliedCode ? `(${appliedCode} · ${promoPct}%)` : ""}: - ${fmt(promoDiscount)}</div>
  )}
  {deliveryFee > 0 && <div>Domicilio: ${fmt(deliveryFee)}</div>}
  <div><b>Total: ${fmt(displayTotal)}</b></div>
</div>

                <button
                  disabled={(cart?.length || 0) === 0}
                  className="mt-3 w-full px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
                  onClick={() => setCheckoutOpen(true)}
                >
                  Ir a pagar
                </button>
              </>
            )}
          </aside>
        </main>

        {/* Resumen en móvil */}
        <div className="lg:hidden mt-6">
          {(current || (cart?.length || 0) > 0) && (
            <>
              <PedidoResumen cart={cart} current={current} currentPrice={currentPrice} />
              <div className="mt-2 text-sm text-gray-600">
                Subtotal: ${fmt(displaySubtotal)}
                {deliveryFee > 0 && (
                  <>
                    {" "}
                    · Domicilio: ${fmt(deliveryFee)} · <b>Total: ${fmt(displayTotal)}</b>
                  </>
                )}
              </div>
              <button
                disabled={(cart?.length || 0) === 0}
                className="mt-3 w-full px-3 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
                onClick={() => setCheckoutOpen(true)}
              >
                Ir a pagar
              </button>
            </>
          )}
        </div>

        {/* Modales */}
        {checkoutOpen && (
          <PagoModal
            open={checkoutOpen}
            onClose={() => setCheckoutOpen(false)}
            onConfirm={confirmOrder}
            total={cartTotal}
          />
        )}
        {confirmOpen && <PedidoModal open={confirmOpen} onClose={() => setConfirmOpen(false)} />}

        {extrasModal.open && (
          <ExtrasModal
            open={extrasModal.open}
            type={extrasModal.type}
            included={extrasModal.included}
            currentCount={extrasModal.currentCount}
            extraPrice={extrasModal.extraPrice}
            onCancel={cancelExtras}
            onConfirm={confirmExtras}
          />
        )}

        <DeliveryPrefModal
          open={showDeliveryModal}
          onSubmit={handleDeliveryPrefSubmit}
          initialPref={deliveryPref || undefined}
        />

        {/* Modal educativo al entrar o al pulsar el botón */}
        <HowToBowlModal open={howToOpen} onClose={closeHowTo} menu={menu} />

        {/* 👇 Modal informativo por bebida extra con combo (solo 1 vez por sesión) */}
        {extraDrinkInfoOpen && (
          <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h3 className="font-semibold">Bebida adicional</h3>
                <button
                  onClick={() => setExtraDrinkInfoOpen(false)}
                  className="w-8 h-8 grid place-items-center rounded hover:bg-gray-100"
                  aria-label="Cerrar"
                >
                  ×
                </button>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-sm text-gray-700">
                  Agregaste una <b>bebida adicional</b>. Esta bebida <b>no está incluida</b> en el combo y tendrá un <b>costo extra</b>.
                </p>
                <div className="text-right">
                  <button
                    onClick={() => setExtraDrinkInfoOpen(false)}
                    className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
                  >
                    Entendido
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
