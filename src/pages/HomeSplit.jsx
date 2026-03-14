// src/components/HomeSplit.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { usePedido } from "../context/PedidoContext";
import StoreHoursGate from "../components/StoreHoursGate";

/* ===== Helpers de horarios (Bogotá) ===== */
const BOGOTA_TZ = "America/Bogota";
const WEEK_MAP = { Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat" };

function bogotaWeekKey(d = new Date()) {
  const wk = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: BOGOTA_TZ }).format(d);
  return WEEK_MAP[wk] || "mon";
}
function bogotaHMMinutes(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BOGOTA_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const hh = Number(parts.find(p => p.type === "hour")?.value || 0);
  const mm = Number(parts.find(p => p.type === "minute")?.value || 0);
  return hh * 60 + mm;
}
function parseHM(s) {
  const [h, m] = String(s || "").split(":");
  const hh = Number(h), mm = Number(m);
  return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
}
function isOpenBySchedule(hours = {}, d = new Date()) {
  if (!hours || typeof hours !== "object" || Object.keys(hours).length === 0) return true;
  const key = bogotaWeekKey(d);
  const cfg = hours[key] || {};
  if (cfg.enabled === false) return false;
  const o = parseHM(cfg.open), c = parseHM(cfg.close);
  if (o == null || c == null) return true;
  if (o === c) return true; // 24h
  const now = bogotaHMMinutes(d);
  // Soporta franja nocturna
  return c > o ? (now >= o && now < c) : (now >= o || now < c);
}
function addDays(d, n) { const dd = new Date(d); dd.setDate(dd.getDate() + n); return dd; }
function bogotaDateParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOGOTA_TZ, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(d);
  const y = parts.find(p=>p.type==="year")?.value;
  const m = parts.find(p=>p.type==="month")?.value;
  const day = parts.find(p=>p.type==="day")?.value;
  return { y, m, day };
}
function nextOpenDate(hours = {}, now = new Date()) {
  for (let i = 0; i < 8; i++) {
    const d = addDays(now, i);
    const key = bogotaWeekKey(d);
    const cfg = hours[key];
    if (!cfg || cfg.enabled === false) continue;
    const o = parseHM(cfg.open), c = parseHM(cfg.close);
    if (o == null || c == null) continue;
    const { y, m, day } = bogotaDateParts(d);
    // Bogotá (UTC-05:00)
    const candidate = new Date(`${y}-${m}-${day}T${cfg.open}:00-05:00`);
    if (i === 0) {
      const nowM = bogotaHMMinutes(now);
      if (nowM < o) return candidate;
      continue;
    }
    return candidate;
  }
  return null;
}
function fmtBogota(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: BOGOTA_TZ, weekday: "long", hour: "numeric", minute: "2-digit",
  }).format(date);
}

export default function HomeSplit() {
  const { menu } = usePedido();

  // ======= Estado abierto/cerrado combinando override + flags comunes + horario =======
  const hours = menu?.settings?.storeHours || {};
  const override = menu?.settings?.storeOverride ?? null; // 'open' | 'closed' | null
  const manualClosed =
    menu?.settings?.storeClosed === true ||
    menu?.settings?.manualClosed === true ||
    override === "closed";
  const manualOpen =
    override === "open" ||
    menu?.settings?.forceOpen === true ||
    menu?.settings?.storeOpen === true;

  const [isStoreOpen, setIsStoreOpen] = useState(true);

  useEffect(() => {
    const check = () => {
      const open = manualOpen ? true : manualClosed ? false : isOpenBySchedule(hours, new Date());
      setIsStoreOpen(open);
    };
    check();
    const id = setInterval(check, 30 * 1000);
    return () => clearInterval(id);
  }, [hours, manualClosed, manualOpen]);

  const nextOpen = useMemo(() => nextOpenDate(hours, new Date()), [hours]);
  const nextOpenLabel = nextOpen ? fmtBogota(nextOpen) : null;

  // ======= Datos visuales =======
  const urlGastro = menu?.heroUrl || "";
  const urlFruver = menu?.heroFruverUrl || "";
  const overlay = Math.max(0, Math.min(1, Number(menu?.settings?.homeOverlayOpacity ?? 0.6)));

  // Logo en tarjetas (NO cambia)
  const cardsLogo = menu?.footerLogoUrl || "";
  // Logo del header SOLO para el modal
  const headerLogo = menu?.headerLogoUrl || menu?.logoUrl || menu?.footerLogoUrl || "";

  const loginHref = "/login"; // ajusta si tu ruta de login es otra

  return (
    
    <div className="min-h-[75vh] grid grid-cols-1 md:grid-cols-2 gap-5 p-6 relative">
      
      {/* Montamos SIEMPRE el gate. Él decide si mostrar modal/overlay */}
      <div className="contents">
        <StoreHoursGate
          // señales de estado para máxima compatibilidad
          isClosed={!isStoreOpen}
          closed={!isStoreOpen}
          isOpen={isStoreOpen}
          open={isStoreOpen}
          visible={!isStoreOpen}
          show={!isStoreOpen}
          // info útil
          hours={hours}
          tz={BOGOTA_TZ}
          nextOpenAt={nextOpen}
          nextOpenLabel={nextOpenLabel}
          // logo SOLO del header para el modal
          logoUrl={headerLogo}
          logo={headerLogo}
          // link para admins/viewers
          loginHref={loginHref}
        />
      </div>
      

      {/* Propuesta gastronómica */}
      <Link
        to="/cliente"
        className={`relative rounded-2xl overflow-hidden group block ${!isStoreOpen ? "pointer-events-none select-none" : ""}`}
        aria-disabled={!isStoreOpen}
      >
        <div
          className={`absolute inset-0 ${urlGastro ? "" : "bg-gradient-to-br from-emerald-700 to-emerald-400"}`}
          style={
            urlGastro
              ? { backgroundImage: `url(${urlGastro})`, backgroundSize: "cover", backgroundPosition: "center" }
              : {}
          }
        />
        <div className="absolute inset-0 transition-all duration-300" style={{ backgroundColor: `rgba(0,0,0,${overlay})` }} />
        <div className="absolute inset-0 transition-all duration-300 group-hover:opacity-0" style={{ backgroundColor: `rgba(0,0,0,${Math.max(overlay - 0.2, 0)})` }} />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center p-8">
          <h2 className="text-white text-2xl md:text-3xl font-bold">Propuesta gastronómica</h2>
          <p className="mt-2 text-white/90 max-w-md text-sm md:text-base">
            Arma tu bowl: proteínas, toppings, salsas y combo/bebida.
          </p>
          <span className="inline-block mt-5 px-5 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold">
            Entrar
          </span>
        </div>
      </Link>

      {/* Frutas y verduras */}
      <Link
        to="/fruver"
        className={`relative rounded-2xl overflow-hidden group block ${!isStoreOpen ? "pointer-events-none select-none" : ""}`}
        aria-disabled={!isStoreOpen}
      >
        <div
          className={`absolute inset-0 ${urlFruver ? "" : "bg-gradient-to-br from-lime-600 to-emerald-500"}`}
          style={
            urlFruver
              ? { backgroundImage: `url(${urlFruver})`, backgroundSize: "cover", backgroundPosition: "center" }
              : {}
          }
        />
        <div className="absolute inset-0 transition-all duration-300" style={{ backgroundColor: `rgba(0,0,0,${overlay})` }} />
        <div className="absolute inset-0 transition-all duration-300 group-hover:opacity-0" style={{ backgroundColor: `rgba(0,0,0,${Math.max(overlay - 0.2, 0)})` }} />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center p-8">
          <h2 className="text-white text-2xl md:text-3xl font-bold">Frutas y verduras</h2>
          <p className="mt-2 text-white/90 max-w-md text-sm md:text-base">
            Elige por libra o unidad según el producto.
          </p>
          <span className="inline-block mt-5 px-5 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold">
            Entrar
          </span>
        </div>
      </Link>
    </div>
  );
}
