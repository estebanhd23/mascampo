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
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pb-8 font-sans">
      
      <header className="w-full max-w-5xl mx-auto px-4 pt-10 pb-6 flex flex-col items-center justify-center relative z-10">
        <div className="w-24 h-24 sm:w-32 sm:h-32 bg-white rounded-[2rem] shadow-sm border border-gray-100 flex items-center justify-center overflow-hidden mb-4 transform hover:scale-105 transition-transform duration-500">
          {headerLogo ? (
            <img src={headerLogo} alt="Logo" className="w-full h-full object-cover" />
          ) : (
            <div className="text-emerald-700 font-bold text-xl text-center leading-tight">
              Más<br/>Campo
            </div>
          )}
        </div>
      </header>

      {/* Grid de 3 columnas */}
      <div className="w-full max-w-6xl grid grid-cols-3 gap-2 sm:gap-6 px-3 sm:px-6 relative flex-1">
        
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
          className={`relative rounded-2xl sm:rounded-3xl overflow-hidden group block shadow-md hover:shadow-xl transition-all duration-300 ${!isStoreOpen ? "grayscale pointer-events-none opacity-80" : "hover:-translate-y-1"}`}
        >
          <div
            className={`absolute inset-0 ${urlGastro ? "" : "bg-emerald-600"}`}
            style={urlGastro ? { backgroundImage: `url(${urlGastro})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}
          />
          <div className="absolute inset-0 bg-black" style={{ opacity: overlay }} />
          
          <div className="relative z-10 h-full min-h-[160px] sm:min-h-[350px] flex flex-col items-center justify-center text-center p-2 sm:p-8">
            <h2 className="text-white text-[11px] sm:text-4xl font-black uppercase tracking-tighter mb-2 sm:mb-4">Bowls</h2>
            <p className="hidden sm:block text-white/90 text-sm mb-6">Arma tu bowl saludable.</p>
            <span className="inline-flex items-center justify-center px-2 py-1.5 sm:px-8 sm:py-3.5 rounded-lg sm:rounded-full bg-emerald-500 text-white font-bold text-[9px] sm:text-base transition-colors hover:bg-emerald-400 shadow-sm border border-emerald-400/30">
              PEDIR
            </span>
          </div>
        </Link>

        {/* --- PARFAITS --- */}
        <Link
          to="/parfaits"
          className={`relative rounded-2xl sm:rounded-3xl overflow-hidden group block shadow-md hover:shadow-xl transition-all duration-300 ${!isStoreOpen ? "grayscale pointer-events-none opacity-80" : "hover:-translate-y-1"}`}
        >
          <div
            className={`absolute inset-0 ${urlParfait ? "" : "bg-purple-600"}`}
            style={urlParfait ? { backgroundImage: `url(${urlParfait})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}
          />
          <div className="absolute inset-0 bg-black" style={{ opacity: overlay }} />
          
          <div className="relative z-10 h-full min-h-[160px] sm:min-h-[350px] flex flex-col items-center justify-center text-center p-2 sm:p-8">
            <h2 className="text-white text-[11px] sm:text-4xl font-black uppercase tracking-tighter mb-2 sm:mb-4">Parfaits</h2>
            <p className="hidden sm:block text-white/90 text-sm mb-6">Yogurt y frutas frescas.</p>
            <span className="inline-flex items-center justify-center px-2 py-1.5 sm:px-8 sm:py-3.5 rounded-lg sm:rounded-full bg-purple-500 text-white font-bold text-[9px] sm:text-base transition-colors hover:bg-purple-400 shadow-sm border border-purple-400/30">
              ARMAR
            </span>
          </div>
        </Link>

        {/* --- VERDURAS --- */}
        <Link
          to="/fruver"
          className={`relative rounded-2xl sm:rounded-3xl overflow-hidden group block shadow-md hover:shadow-xl transition-all duration-300 ${!isStoreOpen ? "grayscale pointer-events-none opacity-80" : "hover:-translate-y-1"}`}
        >
          <div
            className={`absolute inset-0 ${urlFruver ? "" : "bg-orange-500"}`}
            style={urlFruver ? { backgroundImage: `url(${urlFruver})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}
          />
          <div className="absolute inset-0 bg-black" style={{ opacity: overlay }} />
          
          <div className="relative z-10 h-full min-h-[160px] sm:min-h-[350px] flex flex-col items-center justify-center text-center p-2 sm:p-8">
            <h2 className="text-white text-[11px] sm:text-4xl font-black uppercase tracking-tighter mb-2 sm:mb-4">Mercado</h2>
            <p className="hidden sm:block text-white/90 text-sm mb-6">Del campo a tu casa.</p>
            <span className="inline-flex items-center justify-center px-2 py-1.5 sm:px-8 sm:py-3.5 rounded-lg sm:rounded-full bg-orange-500 text-white font-bold text-[9px] sm:text-base transition-colors hover:bg-orange-400 shadow-sm border border-orange-400/30">
              HACER
            </span>
          </div>
        </Link>

      </div>
    </div>
  );
}