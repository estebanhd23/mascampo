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
  if (o === c) return true; 
  const now = bogotaHMMinutes(d);
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

  const hours = menu?.settings?.storeHours || {};
  const override = menu?.settings?.storeOverride ?? null;
  const manualClosed = menu?.settings?.storeClosed === true || menu?.settings?.manualClosed === true || override === "closed";
  const manualOpen = override === "open" || menu?.settings?.forceOpen === true || menu?.settings?.storeOpen === true;

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

  const urlGastro = menu?.heroUrl || "";
  const urlFruver = menu?.heroFruverUrl || "";
  const urlParfait = menu?.heroParfaitUrl || menu?.settings?.storeImages?.coverParfait || "";
  
  const overlay = Math.max(0, Math.min(1, Number(menu?.settings?.homeOverlayOpacity ?? 0.4)));
  const headerLogo = menu?.headerLogoUrl || menu?.logoUrl || menu?.footerLogoUrl || "";

return (
    <div className="min-h-screen bg-[#F0F1F4] flex flex-col items-center pb-8 font-sans">
      
      {/* HEADER LOGO (INTACTO) */}
      <header className="w-full max-w-5xl mx-auto px-4 pt-8 pb-4 sm:pt-10 sm:pb-6 flex flex-col items-center justify-center relative z-10">
        <div className="w-20 h-20 sm:w-32 sm:h-32 bg-white rounded-[1.5rem] sm:rounded-[2rem] shadow-sm border border-gray-100 flex items-center justify-center overflow-hidden mb-2 transform hover:scale-105 transition-transform duration-500">
          {headerLogo ? (
            <img src={headerLogo} alt="Logo" className="w-full h-full object-cover" />
          ) : (
            <div className="text-emerald-700 font-bold text-lg sm:text-xl text-center leading-tight">
              Más<br/>Campo
            </div>
          )}
        </div>
        <div className="max-w-xl mx-auto px-6 text-center mb-10">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Más Campo</h1>
        <p className="mt-2 text-gray-900 text-[13px] font-bold">
          Bowls | Parfait's | Patacrunch <br></br>  | Frutas y verduras
        </p>
      </div>
      </header>

      {/* GRID "HERO + CUADRÍCULA" */}
      <div className="w-full max-w-6xl grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 px-4 sm:px-6 relative flex-1">
        
        <div className="contents">
          <StoreHoursGate
            isClosed={!isStoreOpen} closed={!isStoreOpen}
            isOpen={isStoreOpen} open={isStoreOpen}
            visible={!isStoreOpen} show={!isStoreOpen}
            hours={hours} tz={BOGOTA_TZ}
            nextOpenAt={nextOpen} nextOpenLabel={nextOpenLabel}
            logoUrl={headerLogo} logo={headerLogo}
          />
        </div>

        {/* --- BOWLS --- */}
        <Link
          to="/cliente"
          className={`col-span-1 sm:col-span-1 bg-white rounded-3xl overflow-hidden group block  transition-all duration-300 flex flex-col p-3 ${!isStoreOpen ? "grayscale pointer-events-none opacity-80" : "hover:-translate-y-1"}`}
        >
          {/* h-32 en móviles, h-52 en pantallas grandes */}
          <div
            className={`w-full h-32 sm:h-52 rounded-2xl ${urlGastro ? "" : "bg-emerald-600"}`}
            style={urlGastro ? { backgroundImage: `url(${urlGastro})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}
          />
          <div className="flex items-center justify-center text-center p-2 flex-1">
            <h2 className="text-gray-900 text-xs sm:text-xl font-bold uppercase tracking-tight">Bowls</h2>
          </div>
        </Link>

        {/* --- PARFAITS --- */}
        <Link
          to="/parfaits"
          className={`bg-white rounded-3xl overflow-hidden group block  transition-all duration-300 flex flex-col p-3 ${!isStoreOpen ? "grayscale pointer-events-none opacity-80" : "hover:-translate-y-1"}`}
        >
          <div
            className={`w-full h-32 sm:h-52 rounded-2xl ${urlParfait ? "" : "bg-purple-600"}`}
            style={urlParfait ? { backgroundImage: `url(${urlParfait})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}
          />
          <div className="flex items-center justify-center text-center p-2 flex-1">
            <h2 className="text-gray-900 text-xs sm:text-xl font-bold uppercase tracking-tight">Parfaits</h2>
          </div>
        </Link>

        {/* --- MERCADO/FRUVER --- */}
        <Link
          to="/fruver"
          className={`bg-white rounded-3xl overflow-hidden group block  transition-all duration-300 flex flex-col p-3 ${!isStoreOpen ? "grayscale pointer-events-none opacity-80" : "hover:-translate-y-1"}`}
        >
          <div
            className={`w-full h-32 sm:h-52 rounded-2xl ${urlFruver ? "" : "bg-orange-500"}`}
            style={urlFruver ? { backgroundImage: `url(${urlFruver})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}
          />
          <div className="flex items-center justify-center text-center p-2 flex-1">
            <h2 className="text-gray-900 text-xs sm:text-xl font-bold uppercase tracking-tight">Verduras</h2>
          </div>
        </Link>

      </div>
    </div>
  );
};