// src/components/FruverBulkPricesLite.jsx
import React, { useMemo, useState } from "react";

/**
 * FruverBulkPricesLite
 * - Filtro: Todos / Activos / Inactivos
 * - Exportar CSV (con separador configurable: coma o punto y coma, con BOM para Excel)
 * - Importar CSV y aplicar cambios (merge por id)
 *
 * CSV esperado (headers en cualquier orden): id, name, price, unit, img, active
 * - active: 1/0, true/false, sí/no -> se normaliza a { active: true|false }
 */
export default function FruverBulkPricesLite({
  items = [],
  filename = "fruver-precios.csv",
  onApply = () => alert("No se configuró onApply: se hizo parseo pero no se guardó."),
}) {
  const [filter, setFilter] = useState("all"); // "all" | "active" | "inactive"
  const [sep, setSep] = useState(";"); // separador preferido para Excel en es-CO
  const [parsedRows, setParsedRows] = useState(null); // array con filas importadas

  // ==== DERIVADOS ====
  const filtered = useMemo(() => {
    if (!Array.isArray(items)) return [];
    const base = [...items].sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
    if (filter === "active") return base.filter((x) => x?.active !== false);
    if (filter === "inactive") return base.filter((x) => x?.active === false);
    return base;
  }, [items, filter]);

  const totals = useMemo(() => {
    const total = items?.length || 0;
    const act = items?.filter((x) => x?.active !== false).length || 0;
    const inact = items?.filter((x) => x?.active === false).length || 0;
    return { total, act, inact };
  }, [items]);

  // ==== HELPERS CSV ====
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    const needQuote = s.includes('"') || s.includes("\n") || s.includes(",") || s.includes(";");
    return needQuote ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const toBoolean = (v) => {
    const s = String(v ?? "").trim().toLowerCase();
    if (["1", "true", "sí", "si", "y", "yes"].includes(s)) return true;
    if (["0", "false", "no", "n"].includes(s)) return false;
    // por compatibilidad con tu regla antigua: si viene vacío => activo
    return s === "" ? true : Boolean(v);
  };

  const toNumber = (v) => {
    const n = Number(String(v).replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  // ==== EXPORTAR ====
  const downloadCSV = () => {
    // Orden de columnas fijo y claro
    const headers = ["id", "name", "price", "unit", "img", "active"];
    const lines = [];

    lines.push(headers.join(sep));

    filtered.forEach((it) => {
      const row = [
        esc(it?.id),
        esc(it?.name),
        toNumber(it?.price),
        esc(it?.unit || "lb"),
        esc(it?.img || ""),
        it?.active === false ? 0 : 1, // 1=activo, 0=inactivo
      ];
      lines.push(row.join(sep));
    });

    // BOM para que Excel detecte UTF-8 correctamente
    const csv = "\uFEFF" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  // ==== IMPORTAR ====
  const parseCSVText = (text) => {
    // Detecta separador automáticamente si el usuario pegó CSV con otro separador
    const firstLine = text.split(/\r?\n/)[0] || "";
    let sepGuess = sep;
    if (firstLine.includes(";")) sepGuess = ";";
    else if (firstLine.includes(",")) sepGuess = ",";

    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return [];

    // Headers
    const headers = lines[0].split(sepGuess).map((h) => h.trim().toLowerCase());
    const idx = (name) => headers.indexOf(name);

    const idIdx = idx("id");
    if (idIdx === -1) throw new Error("El CSV debe incluir la columna 'id'.");

    const nameIdx = idx("name");
    const priceIdx = idx("price");
    const unitIdx = idx("unit");
    const imgIdx = idx("img");
    const activeIdx = idx("active");

    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const raw = smartSplit(lines[i], sepGuess);
      if (!raw.length) continue;

      const row = {
        id: raw[idIdx]?.trim(),
        name: nameIdx >= 0 ? raw[nameIdx]?.trim() : undefined,
        price: priceIdx >= 0 ? toNumber(raw[priceIdx]) : undefined,
        unit: unitIdx >= 0 ? raw[unitIdx]?.trim() : undefined,
        img: imgIdx >= 0 ? (raw[imgIdx] || "").trim() : undefined,
        active: activeIdx >= 0 ? toBoolean(raw[activeIdx]) : undefined,
      };
      if (row.id) rows.push(row);
    }

    return rows;
  };

  // split de CSV simple con comillas
  const smartSplit = (line, delimiter) => {
    const out = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"'; // escapado ""
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  const handleFile = async (file) => {
    const txt = await file.text();
    try {
      const rows = parseCSVText(txt);
      setParsedRows(rows);
      alert(`Archivo leído: ${rows.length} filas con id ✅`);
    } catch (e) {
      console.error(e);
      alert(`Error al leer CSV: ${e.message}`);
    }
  };

  const applyParsedRows = () => {
    if (!parsedRows?.length) return alert("No hay filas para aplicar.");
    // merge por id: sobrescribe solo campos presentes en CSV
    const byId = new Map((items || []).map((x) => [x?.id, { ...x }]));

    parsedRows.forEach((r) => {
      const base = byId.get(r.id) || { id: r.id };
      const next = { ...base };
      if (r.name !== undefined) next.name = r.name;
      if (r.price !== undefined) next.price = toNumber(r.price);
      if (r.unit !== undefined) next.unit = r.unit || "lb";
      if (r.img !== undefined) next.img = r.img || "";
      if (r.active !== undefined) next.active = !!r.active;
      byId.set(r.id, next);
    });

    const merged = Array.from(byId.values()).sort((a, b) =>
      String(a?.name || "").localeCompare(String(b?.name || ""))
    );

    onApply(merged); // delega a tu setMenu en el padre
    setParsedRows(null);
  };

  return (
    <div className="space-y-4">
      {/* Contenedor visual: BLANCO como el resto */}
      <div className="rounded-2xl p-4 sm:p-5 bg-white shadow-sm border border-gray-200">
        {/* Fila superior: filtros + export + separador */}
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          {/* Filtro */}
          <div className="grid gap-1">
            <label className="text-sm text-gray-600">Filtrar productos</label>
            <div className="inline-flex rounded-lg border overflow-hidden w-fit bg-white">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`px-3 py-1.5 text-sm ${
                  filter === "all" ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                Todos ({totals.total})
              </button>
              <button
                type="button"
                onClick={() => setFilter("active")}
                className={`px-3 py-1.5 text-sm border-l ${
                  filter === "active" ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                Activos ({totals.act})
              </button>
              <button
                type="button"
                onClick={() => setFilter("inactive")}
                className={`px-3 py-1.5 text-sm border-l ${
                  filter === "inactive" ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                Inactivos ({totals.inact})
              </button>
            </div>
            <small className="text-xs text-gray-500">
              Regla: <b>activo</b> cuando <code>active !== false</code>.
            </small>
          </div>

          {/* Exportar + Separador */}
          <div className="flex items-end gap-3 flex-wrap">
            <div className="grid">
              <label className="text-xs text-gray-600">Separador CSV</label>
              <select
                value={sep}
                onChange={(e) => setSep(e.target.value)}
                className="px-3 py-2 rounded-lg border bg-white text-sm"
              >
                <option value=";">Punto y coma (;)</option>
                <option value=",">Coma (,)</option>
              </select>
            </div>

            <div className="text-right">
              <button
                onClick={downloadCSV}
                className="px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800"
              >
                Exportar CSV ({filtered.length})
              </button>
              <div className="text-xs text-gray-500 mt-1">
                Orden columnas: <code>id, name, price, unit, img, active</code>.
              </div>
            </div>
          </div>
        </div>

        {/* Importar */}
        <div className="mt-5 grid gap-2">
          <label className="text-sm text-gray-700">Importar CSV para actualizar precios/unidades/activo</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="block w-full text-sm"
          />
          <small className="text-xs text-gray-500">
            Debe contener al menos <code>id</code>. Columnas opcionales: <code>name, price, unit, img, active</code>.
          </small>

          {parsedRows?.length ? (
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded-lg mt-2">
              <span className="text-sm">Archivo listo: {parsedRows.length} fila(s) con id.</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setParsedRows(null)}
                  className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-100 text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={applyParsedRows}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 text-sm"
                >
                  Aplicar cambios
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Tabla (preview) */}
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm border rounded-lg overflow-hidden bg-white">
            <thead className="bg-gray-50 text-gray-700">
              <tr className="text-left">
                <th className="p-2 border-b">Nombre</th>
                <th className="p-2 border-b">Precio</th>
                <th className="p-2 border-b">Unidad</th>
                <th className="p-2 border-b">Activo</th>
                <th className="p-2 border-b">ID</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-3 text-center text-gray-500">
                    No hay productos para este filtro.
                  </td>
                </tr>
              ) : (
                filtered.map((it) => (
                  <tr key={it?.id} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="p-2">{it?.name}</td>
                    <td className="p-2">{toNumber(it?.price).toLocaleString("es-CO")}</td>
                    <td className="p-2">{it?.unit || "lb"}</td>
                    <td className="p-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          it?.active === false
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {it?.active === false ? "Inactivo" : "Activo"}
                      </span>
                    </td>
                    <td className="p-2 font-mono text-[11px] break-all">{it?.id}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="text-xs text-gray-500 mt-2">
            Vista previa ordenada por <b>Nombre</b>. Exportación respeta ese orden.
          </div>
        </div>
      </div>
    </div>
  );
}
