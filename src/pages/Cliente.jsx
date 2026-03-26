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
import { useNavigate } from "react-router-dom";


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

  const navigate = useNavigate();

  const coverFromDb = menu?.settings?.storeImages?.cover;
  const portadaUrl = (coverFromDb && coverFromDb.trim() !== '') 
    ? coverFromDb 
    : 'https://images.unsplash.com/photo-1543353071-873f17a7a088?q=80&w=1200&auto=format&fit=crop';

  const profileGastro = menu?.settings?.storeImages?.profileGastro;
  const perfilUrl = (profileGastro && profileGastro.trim() !== '') 
    ? profileGastro
    : 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=150&auto=format&fit=crop';
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

// === Código promocional (Conectado a la Intranet) ===
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState(null); // Ahora guarda el objeto completo
  const [promoOpen, setPromoOpen] = useState(false);

  // aplicar código
  const applyPromo = () => {
    const codeUpper = promoInput.trim().toUpperCase();
    if (!codeUpper) return;

    // 1. Leer los códigos desde Firebase (creados en Intranet)
    const validCodes = menu?.settings?.promoCodes || [];
    
    // 2. Buscar si el código existe y está activo
    const found = validCodes.find(c => c.code === codeUpper && c.active !== false);

    if (found) {
      // 3. Validar el monto mínimo de compra usando displaySubtotal
      if (displaySubtotal >= (found.minAmount || 0)) {
        setAppliedPromo({ 
          code: found.code, 
          discountPct: found.discount, 
          minAmount: found.minAmount || 0 
        });
        alert(`¡Código aplicado! ${found.discount}% de descuento.`);
      } else {
        alert(`Este código requiere un pedido mínimo de $${(found.minAmount || 0).toLocaleString("es-CO")}`);
      }
    } else {
      alert("Código inválido, inactivo o expirado.");
      setAppliedPromo(null);
    }
  };

  // Quitar código
  const clearPromo = () => {
    setAppliedPromo(null);
    setPromoInput("");
  };

  // Descuento aplicado sobre el SUBTOTAL visible (sin domicilio)
  // Automáticamente se vuelve 0 si el usuario elimina bowls y baja del mínimo
  const promoDiscount = useMemo(() => {
    if (appliedPromo && displaySubtotal >= appliedPromo.minAmount) {
      return Math.floor(displaySubtotal * (appliedPromo.discountPct / 100));
    }
    return 0;
  }, [displaySubtotal, appliedPromo]);

  // Descuento aplicado al carrito real
  const cartDiscount = useMemo(() => {
    if (appliedPromo && cartSubtotal >= appliedPromo.minAmount) {
      return Math.floor(cartSubtotal * (appliedPromo.discountPct / 100));
    }
    return 0;
  }, [cartSubtotal, appliedPromo]);

  // Totales con descuento y domicilio
  const cartTotal    = Math.max(0, cartSubtotal - cartDiscount + deliveryFee);
  const displayTotal = Math.max(0, displaySubtotal - promoDiscount + deliveryFee);




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
    promoCode: appliedPromo?.code || null,
    promoPercent: appliedPromo?.discountPct || 0,
    promoDiscount: cartDiscount || 0,
    total: cartTotal,
}
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

      {/* PORTADA Y PERFIL */}
<div className="relative mb-12"> 
  {/* BOTÓN FLOTANTE ATRÁS */}
<button
  onClick={() => navigate('/')}
  className="absolute top-4 left-4 sm:top-6 sm:left-6 z-50 w-10 h-10 sm:w-12 sm:h-12 bg-white/90 backdrop-blur-md border border-white/50 rounded-full shadow-lg flex items-center justify-center text-gray-800 hover:bg-white hover:scale-105 transition-all active:scale-95"
  aria-label="Volver al inicio"
>
  <svg className="w-5 h-5 sm:w-6 sm:h-6 pr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
</button>
        <div className="w-full h-32 sm:h-40 md:h-56 bg-gray-200">
          <img src={portadaUrl} alt="Portada de la tienda" className="w-full h-full object-cover" />
        </div>

        <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-1/2 z-10">
          <div 
            onClick={() => navigate('/')} 
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-white shadow-lg overflow-hidden bg-white cursor-pointer hover:scale-105 transition-transform duration-300"
            title="Volver al inicio"
          >
            <img src={perfilUrl} alt="Logo de la tienda" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>

  {/* 👇 INFO DE LA TIENDA (Estilo Minimalista Rappi) */}
<div className="max-w-7xl mx-auto px-6 pt-8 pb-10 text-center flex flex-col items-center border-b border-gray-100 mb-8">
  
  {/* Nombre con tipografía elegante y no tan "pesada" */}
  <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Más Campo</h1>
  
  {/* Línea de Meta-información (Estilo Pill de Rappi) */}
  <div className="flex flex-wrap items-center justify-center gap-4 mt-4 text-[13px] text-gray-500">
    
    {/* Calificación */}
    <div className="flex items-center gap-1.5 py-1 px-2 hover:bg-gray-50 rounded-lg transition-colors">
      <svg className="w-3.5 h-3.5 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      <span className="font-semibold text-gray-700">4.9</span>
      <span className="text-gray-400">(120+)</span>
    </div>

    <span className="w-1 h-1 bg-gray-300 rounded-full hidden sm:inline" />

    {/* Tiempo de entrega (Sin emoji, solo texto y gris) */}
    <div className="py-1 px-2">
      <span className="text-gray-400 mr-1 font-light">Entrega en</span>
      <span className="font-medium text-gray-700">
        {deliveryPref?.eta ? `${deliveryPref.eta} min` : "20-35 min"}
      </span>
    </div>

    <span className="w-1 h-1 bg-gray-300 rounded-full hidden sm:inline" />

    {/* Costo de Envío / Selección de Barrio */}
    <button 
      onClick={() => setShowDeliveryModal(true)}
      className="flex items-center gap-1.5 py-1 px-2 text-blue-500 font-medium hover:underline decoration-blue-200 underline-offset-4"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      {deliveryPref?.modo === "Lo recojo" 
        ? "Recoger en tienda" 
        : deliveryPref?.barrioName 
          ? `Envío $${deliveryFee.toLocaleString("es-CO")}`
          : "Seleccionar entrega"}
    </button>
  </div>

  {/* Descripción en gris suave y letra ligera */}
  <p className="mt-5 text-gray-400 text-[13px] max-w-sm font-light leading-relaxed">
    Bowls saludables e ingredientes frescos directo a tu mesa en Manizales.
  </p>
</div>

      <div className="max-w-7xl mx-auto px-6 pb-6">
        <header className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">Arma tu Bowl</h2>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHowToOpen(true)}
              className="text-xs underline text-gray-600 hover:text-gray-900"
            >
              ¿Cómo armar un bowl?
            </button>
          </div>
        </header>

{/* 👇 DINÁMICO: 1 columna ancha si está vacío, 3 columnas si hay carrito */}
        <main className={`grid gap-6 ${(current || (cart?.length || 0) > 0) ? "lg:grid-cols-3" : "lg:grid-cols-1 max-w-5xl mx-auto w-full"}`}>
          
          <section className={`${(current || (cart?.length || 0) > 0) ? "lg:col-span-2" : "w-full"} space-y-6`}>
            {/* Bowls - Optimizados para Móvil y Escritorio */}
            {!current && (
              <div className="w-full">
                
                {/* 👇 DINÁMICO: 3 columnas de bowls si no hay panel lateral, 2 si lo hay */}
                <div className={`grid grid-cols-1 sm:grid-cols-2 ${(current || (cart?.length || 0) > 0) ? "" : "lg:grid-cols-3"} gap-4`}>
                  {(Array.isArray(menu?.bowls) ? menu.bowls : []).map((b, idx) => {
                    const pct = Number(bowlDiscounts[b?.id] || 0);
                    const effBase = Number(b?.precio || 0) * (1 - (pct / 100));
                    
                    return (
                      <div 
                        key={b?.id ?? `bowl-${idx}`} 
                        onClick={() => startBowl(b?.id)}
                        className="group relative flex items-center justify-between gap-3 p-3.5 sm:p-4 bg-white border border-gray-100 rounded-2xl shadow-sm active:scale-[0.98] active:bg-gray-50 hover:shadow-md transition-all duration-200 cursor-pointer touch-manipulation"
                      >
                        <div className="flex-1 min-w-0 py-1">
                          <h3 className="text-lg font-semibold text-gray-900 truncate">
                            {b?.name}
                          </h3>
                          <p className="text-sm text-gray-500 line-clamp-2 mt-0.5 leading-snug pr-2">
                            Incluye {b?.proteinasIncluidas ?? 0} {b?.proteinasIncluidas === 1 ? 'proteína' : 'proteínas'} y {b?.toppingsIncluidos ?? 0} toppings.
                          </p>
                          <div className="mt-2.5 flex items-center gap-2">
                            {pct > 0 ? (
                              <>
                                <span className="text-lg font-extrabold text-emerald-600">${money(effBase)}</span>
                                <span className="text-sm text-gray-400 line-through">${money(Number(b?.precio || 0))}</span>
                              </>
                            ) : (
                              <span className="text-lg font-bold text-gray-900">${money(Number(b?.precio || 0))}</span>
                            )}
                          </div>
                        </div>

                        <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0">
                          <div className="w-full h-full rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                            {b?.img ? (
                              <img src={b.img} alt={b.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-emerald-100 bg-emerald-50">
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                              </div>
                            )}
                          </div>
                          {pct > 0 && (
                            <div className="absolute -top-2 -left-2 bg-yellow-500  text-white text-[10px] font-black px-2 py-1 rounded-lg z-10">
                              -{pct}%
                            </div>
                          )}
                          <div className="absolute -bottom-2 -right-2 bg-white text-emerald-600 w-8 h-8 flex items-center justify-center rounded-full shadow-md z-10 border border-gray-100">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                            </svg>
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
                    <div className="p-3">
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
                      <div className="p-3">
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
                      <div className="p-3">
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

                  {promoDiscount > 0 && appliedPromo && (
                    <div className="flex justify-between items-center text-sm text-red-600">
                      <span>Promo ({appliedPromo.code} · {appliedPromo.discountPct}%)</span>
                      <span>- ${fmt(promoDiscount)}</span>
                    </div>
                  )}

                  {deliveryFee > 0 && (
                    <div className="flex justify-between items-center text-sm text-gray-600">
                      <span>
                        Domicilio {deliveryPref?.barrioName ? `(${deliveryPref.barrioName})` : ""}
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
                    className="px-4 py-3 bg-green-500 text-white rounded w-full"
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

            {/* 👇 CÓDIGO PROMOCIONAL: Estilo Desplegable y sutil */}
            {(current || (cart?.length || 0) > 0) && (
              <div className="border border-gray-100 rounded-xl bg-white shadow-sm overflow-hidden mt-4">
                <button
                  type="button"
                  onClick={() => setPromoOpen(!promoOpen)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <span className="font-medium text-gray-700">
                      {appliedPromo ? `Código aplicado: ${appliedPromo.code}` : "¿Tienes un código promocional?"}
                    </span>
                  </div>
                  <span className="text-gray-400 text-xl leading-none font-light">
                    {promoOpen ? "−" : "+"}
                  </span>
                </button>

                {promoOpen && (
                  <div className="p-4 border-t border-gray-100 bg-gray-50/50">
                    <div className="flex gap-2 flex-col sm:flex-row">
                      <input
                        className="flex-1 border border-gray-300 rounded-lg p-2.5 uppercase focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all bg-white"
                        placeholder="INGRESA TU CÓDIGO"
                        value={promoInput}
                        onChange={(e) => setPromoInput(e.target.value)}
                        disabled={!!appliedPromo}
                      />
                      {!appliedPromo ? (
                        <button
                          onClick={applyPromo}
                          className="px-6 py-2.5 rounded-lg bg-emerald-600 text-white font-medium 
                           transition-colors shadow-sm"
                        >
                          Aplicar
                        </button>
                      ) : (
                        <button
                          onClick={clearPromo}
                          className="px-6 py-2.5 rounded-lg border border-gray-300 hover:bg-white text-gray-600 font-medium transition-colors bg-white"
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

          </section> {/* Fin de la columna izquierda */}

          {/* 👇 RESUMEN LATERAL (TU PEDIDO) - Panel Premium para PC */}
          {(current || (cart?.length || 0) > 0) && (
            <aside className="p-5 border border-gray-100 bg-white rounded-xl h-fit sticky top-4  shadow-sm">
              <PedidoResumen cart={cart} current={current} currentPrice={currentPrice} />
              
              <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600 space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-medium">${fmt(displaySubtotal)}</span>
                </div>
                {promoDiscount > 0 && appliedPromo && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Promo ({appliedPromo.code})</span>
                    <span>- ${fmt(promoDiscount)}</span>
                  </div>
                )}
                {deliveryFee > 0 && (
                  <div className="flex justify-between">
                    <span>Domicilio</span>
                    <span className="font-medium">${fmt(deliveryFee)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-3 mt-1 border-t border-gray-100">
                  <span className="text-base text-gray-900 font-bold">Total</span>
                  <span className="text-lg font-bold text-emerald-600">${fmt(displayTotal)}</span>
                </div>
              </div>

              <button
                disabled={(cart?.length || 0) === 0}
                className="mt-6 w-full px-4 py-3 bg-emerald-600 text-white font-bold rounded-lg disabled:opacity-50 disabled:bg-gray-400 hover:bg-emerald-700 transition-colors shadow-md"
                onClick={() => setCheckoutOpen(true)}
              >
                Ir a pagar
              </button>
            </aside>
          )}
        </main>

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
