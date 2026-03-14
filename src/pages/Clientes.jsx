// src/pages/Clientes.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";

const db = getFirestore();

const emptyForm = {
  nitOrId: "",
  name: "",
  contact: "",
  phone: "",
  email: "",
  role: "mayorista",
  creditDays: 0,
  status: "activo",
};

export default function Clientes() {
  const [form, setForm] = useState(emptyForm);
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();

  async function load() {
    setLoading(true);
    setErrorMsg("");
    try {
      const qs = query(collection(db, "clients"), orderBy("name"));
      const snap = await getDocs(qs);
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setList(arr);
    } catch (e) {
      console.error(e);
      setErrorMsg("No se pudo cargar la lista de clientes. Verifica tu conexión o permisos de Firestore.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.nitOrId || "").toLowerCase().includes(q) ||
        (c.contact || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
    );
  }, [list, search]);

  function onChange(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e) {
    e?.preventDefault?.();
    if (!form.nitOrId.trim() || !form.name.trim()) {
      alert("NIT/Cédula y Nombre son obligatorios");
      return;
    }
    setLoading(true);
    try {
      const dupQ = query(collection(db, "clients"), where("nitOrId", "==", form.nitOrId.trim()));
      const dup = await getDocs(dupQ);
      const duplicate = dup.docs.some((d) => d.id !== editingId);

      if (!editingId && duplicate) {
        alert("Ya existe un cliente con ese NIT/Cédula");
        return;
      }

      if (editingId) {
        await updateDoc(doc(db, "clients", editingId), {
          ...form,
          nitOrId: form.nitOrId.trim(),
          updatedAt: serverTimestamp(),
        });
        alert("Cliente actualizado");
      } else {
        await addDoc(collection(db, "clients"), {
          ...form,
          nitOrId: form.nitOrId.trim(),
          createdAt: serverTimestamp(),
        });
        alert("Cliente creado");
      }
      setForm(emptyForm);
      setEditingId(null);
      load();
    } catch (e) {
      console.error(e);
      alert("Error guardando cliente");
    } finally {
      setLoading(false);
    }
  }

  function onEdit(c) {
    setEditingId(c.id);
    setForm({
      nitOrId: c.nitOrId || "",
      name: c.name || "",
      contact: c.contact || "",
      phone: c.phone || "",
      email: c.email || "",
      role: c.role || "mayorista",
      creditDays: Number(c.creditDays || 0),
      status: c.status || "activo",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function onCancel() {
    setEditingId(null);
    setForm(emptyForm);
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <h1 className="text-xl font-semibold mb-4">Gestión de clientes</h1>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {errorMsg}
        </div>
      )}

      <form onSubmit={save} className="rounded-2xl border p-4 mb-6">
        <h2 className="font-semibold mb-3">
          {editingId ? "Editar cliente" : "Nuevo cliente"}
        </h2>

        <div className="grid md:grid-cols-3 gap-3">
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="NIT o Cédula *"
            value={form.nitOrId}
            onChange={(e) => onChange("nitOrId", e.target.value)}
          />
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Nombre del cliente *"
            value={form.name}
            onChange={(e) => onChange("name", e.target.value)}
          />
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Contacto"
            value={form.contact}
            onChange={(e) => onChange("contact", e.target.value)}
          />
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Teléfono (WhatsApp)"
            value={form.phone}
            onChange={(e) => onChange("phone", e.target.value)}
          />
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Correo"
            value={form.email}
            onChange={(e) => onChange("email", e.target.value)}
          />
          <select
            className="border rounded-lg px-3 py-2"
            value={form.role}
            onChange={(e) => onChange("role", e.target.value)}
          >
            <option value="mayorista">Mayorista</option>
            <option value="institucional">Institucional</option>
            <option value="minorista">Minorista</option>
          </select>
          <input
            type="number"
            min="0"
            className="border rounded-lg px-3 py-2"
            placeholder="Días de crédito"
            value={form.creditDays}
            onChange={(e) => onChange("creditDays", e.target.value)}
          />
          <select
            className="border rounded-lg px-3 py-2"
            value={form.status}
            onChange={(e) => onChange("status", e.target.value)}
          >
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>

          <div className="flex gap-2 items-center">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
              disabled={loading}
            >
              {editingId ? "Actualizar" : "Crear"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-lg border"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Loader y tabla */}
      {loading && <p className="text-sm text-gray-500 mb-3">Cargando...</p>}

      <div className="rounded-2xl border p-4 mb-3">
        <input
          className="border rounded-lg px-3 py-2 w-full"
          placeholder="Buscar por nombre, NIT/Cédula, contacto o teléfono"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-2xl border overflow-auto mb-4">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b">
              <th className="text-left p-2">NIT/Cédula</th>
              <th className="text-left p-2">Nombre</th>
              <th className="text-left p-2">Contacto</th>
              <th className="text-left p-2">Teléfono</th>
              <th className="text-left p-2">Correo</th>
              <th className="text-left p-2">Rol</th>
              <th className="text-left p-2">Crédito (días)</th>
              <th className="text-left p-2">Estado</th>
              <th className="p-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {!loading &&
              filtered.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="p-2">{c.nitOrId}</td>
                  <td className="p-2">{c.name}</td>
                  <td className="p-2">{c.contact}</td>
                  <td className="p-2">{c.phone}</td>
                  <td className="p-2">{c.email}</td>
                  <td className="p-2 capitalize">{c.role}</td>
                  <td className="p-2">{c.creditDays || 0}</td>
                  <td className="p-2 capitalize">{c.status || "activo"}</td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() => onEdit(c)}
                      className="px-3 py-1 rounded-lg border"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="p-3 text-center text-gray-500">
                  No hay clientes aún
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ✅ Botón volver atrás */}
      <div className="mt-6">
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 rounded-lg border hover:bg-gray-50"
        >
          ← Volver atrás
        </button>
      </div>
    </div>
  );
}
