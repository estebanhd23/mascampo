// src/components/Admin/EditUserModal.jsx

import React, { useState } from 'react';
import { db } from '../../firebase'; // Asegúrate de la ruta correcta a tu firebase.js
import { doc, updateDoc } from 'firebase/firestore';

// Roles disponibles (para el dropdown)
const AVAILABLE_ROLES = [
    { value: 'viewer', label: 'Cliente General' },
    { value: 'restaurant', label: 'Restaurante PRO' },
    { value: 'mayorista', label: 'Mayorista' },
    { value: 'operator', label: 'Operador' },
    { value: 'admin', label: 'Administrador' },
];

export default function EditUserModal({ user, onClose }) {
    // 1. Estado inicial del formulario basado en el usuario actual
    const [formData, setFormData] = useState({
        nombre: user.nombre || '',
        telefono: user.telefono || '',
        role: user.role || 'viewer',
        // 🛑 Campo de Crédito: lo obtenemos de user.credito.cupo
        creditDays: user.credito?.cupo || 0, 
    });
    const [saving, setSaving] = useState(false);

    // 2. Manejo de cambios en el formulario
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    // 3. Función de guardado
    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);

        const creditDaysNum = Number(formData.creditDays);
        if (isNaN(creditDaysNum) || creditDaysNum < 0) {
            alert("Los días de crédito deben ser un número positivo.");
            setSaving(false);
            return;
        }

        try {
            const userRef = doc(db, "users", user.id);
            
            // 🛑 Data a actualizar en Firestore
            const updateData = {
                nombre: formData.nombre,
                telefono: formData.telefono,
                role: formData.role,
                // 🛑 Actualizamos el campo anidado 'credito.cupo'
                credito: { cupo: creditDaysNum }
            };

            await updateDoc(userRef, updateData);
            alert(`Cliente ${formData.nombre} actualizado con éxito.`);
            onClose(); // Cierra el modal
        } catch (error) {
            console.error("Error al guardar cliente:", error);
            alert(`Error al guardar: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
                <div className="px-5 py-4 border-b flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Editar Cliente: {user.email}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
                </div>

                <form onSubmit={handleSave} className="p-5 space-y-4">
                    
                    {/* Nombre y Teléfono */}
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Nombre Completo</label>
                        <input type="text" name="nombre" value={formData.nombre} onChange={handleChange} required className="w-full border p-2 rounded" />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Teléfono</label>
                        <input type="tel" name="telefono" value={formData.telefono} onChange={handleChange} className="w-full border p-2 rounded" />
                    </div>
                    
                    {/* Rol */}
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Rol de Usuario</label>
                        <select name="role" value={formData.role} onChange={handleChange} required className="w-full border p-2 rounded">
                            {AVAILABLE_ROLES.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* 🛑 CRÉDITO B2B (Días de Cupo) */}
                    <div>
                        <label className="block text-sm text-gray-700 mb-1">Días de Crédito Asignados</label>
                        <input 
                            type="number" 
                            name="creditDays" 
                            value={formData.creditDays} 
                            onChange={handleChange} 
                            min="0" 
                            className="w-full border p-2 rounded" 
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            El cliente solo tendrá la opción de pago a crédito si el rol es 'Restaurante PRO' y los días son **&gt; 0**.
                        </p>
                    </div>

                    {/* Botones de Acción */}
                    <div className="pt-4 border-t flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                            disabled={saving}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700"
                            disabled={saving}
                        >
                            {saving ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}