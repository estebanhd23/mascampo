// src/components/PagoModal.jsx
import React, { useState, useEffect } from "react";
// 🛑 Importamos usePedido para obtener el rol y los datos de crédito.
import { usePedido } from "../context/PedidoContext"; 

export default function PagoModal({ open, onClose, onConfirm, total }) {
    // 1. Obtener datos del contexto
    const { userDoc, role } = usePedido();
    const creditDays = userDoc?.credito?.cupo || 0;
    const canUseCredit = role === 'restaurant' && creditDays > 0;

    // Función de formato de dinero
    const fmt = (n) => (Number(n) || 0).toLocaleString("es-CO");
    
    // 2. Estado del formulario (inicializar el método de pago)
    const [form, setForm] = useState(() => ({
        nombre: userDoc?.nombre || "", // Pre-llenar si existe
        direccion: "",
        telefono: userDoc?.telefono || "", // Pre-llenar si existe
        // 🛑 Si puede usar crédito, lo seleccionamos por defecto.
        metodoPago: canUseCredit ? "Crédito" : "Efectivo", 
    }));

    useEffect(() => {
        if (open) {
            // Al abrir, si el rol cambia, aseguramos la preferencia de pago.
            setForm(f => ({ 
                ...f, 
                metodoPago: canUseCredit ? "Crédito" : f.metodoPago
            }));
        }
    }, [open, canUseCredit]);

    if (!open) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // 🛑 Validación de crédito
        if (form.metodoPago === 'Crédito' && !canUseCredit) {
            alert("Error: La opción de crédito no está habilitada para esta cuenta.");
            return;
        }

        // El componente padre (Fruver.jsx) usará 'form.metodoPago' para saber si fue a crédito
        // y usará userDoc.credito.cupo para grabar los días de crédito.
        onConfirm?.(form); 
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-lg">
                <div className="px-5 py-4 border-b flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Datos de entrega</h3>
                    <button
                        type="button"
                        className="text-gray-500 hover:text-gray-700"
                        onClick={onClose}
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    
                    {/* Campos de Datos de Entrega (se mantienen) */}
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Nombre</label>
                        <input
                            className="w-full border p-2 rounded"
                            value={form.nombre}
                            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Dirección</label>
                        <input
                            className="w-full border p-2 rounded"
                            value={form.direccion}
                            onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Teléfono</label>
                        <input
                            className="w-full border p-2 rounded"
                            value={form.telefono}
                            onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                            required
                        />
                    </div>

                    {/* SECCIÓN MÉTODO DE PAGO */}
                    <div>
                        <p className="block text-sm text-gray-700 mb-2">Método de pago</p>
                        <div className="space-y-2">
                            
                            {/* 🛑 NUEVA OPCIÓN: CRÉDITO B2B */}
                            {canUseCredit && (
                                <label className="flex items-center gap-2 p-2 bg-green-50 border border-green-300 rounded-lg">
                                    <input
                                        type="radio"
                                        name="metodoPago"
                                        value="Crédito"
                                        checked={form.metodoPago === "Crédito"}
                                        onChange={(e) => setForm({ ...form, metodoPago: e.target.value })}
                                        className="text-green-600 focus:ring-green-500"
                                    />
                                    <span className="font-bold text-green-800">
                                        Crédito a {creditDays} días
                                    </span>
                                </label>
                            )}

                            {/* Opciones existentes (las mantenemos con estilo estándar) */}
                            <label className={`flex items-center gap-2 p-2 border rounded-lg ${form.metodoPago === 'Efectivo' && 'bg-gray-100'}`}>
                                <input
                                    type="radio"
                                    name="metodoPago"
                                    value="Efectivo"
                                    checked={form.metodoPago === "Efectivo"}
                                    onChange={(e) => setForm({ ...form, metodoPago: e.target.value })}
                                    disabled={form.metodoPago === 'Crédito'} 
                                />
                                Efectivo
                            </label>

                            <label className={`flex items-center gap-2 p-2 border rounded-lg ${form.metodoPago === 'linkdepago' && 'bg-gray-100'}`}>
                                <input
                                    type="radio"
                                    name="metodoPago"
                                    value="linkdepago"
                                    checked={form.metodoPago === "linkdepago"}
                                    onChange={(e) => setForm({ ...form, metodoPago: e.target.value })}
                                    disabled={form.metodoPago === 'Crédito'} 
                                />
                                Link de pago
                            </label>

                            <label className={`flex items-center gap-2 p-2 border rounded-lg ${form.metodoPago === 'Transferencia' && 'bg-gray-100'}`}>
                                <input
                                    type="radio"
                                    name="metodoPago"
                                    value="Transferencia"
                                    checked={form.metodoPago === "Transferencia"}
                                    onChange={(e) => setForm({ ...form, metodoPago: e.target.value })}
                                    disabled={form.metodoPago === 'Crédito'} 
                                />
                                Transferencia
                            </label>
                        </div>
                    </div>

                    <div className="pt-2 border-t flex items-center justify-between">
                        <div className="text-sm text-gray-600">Total a cobrar</div>
                        <div className="font-bold">
                            ${fmt(total)}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700"
                        >
                            Enviar pedido
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}