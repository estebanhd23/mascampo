import React, { useState } from 'react';
import { usePedido } from '../../context/PedidoContext'; // Asegúrate de la ruta correcta
import { useNavigate } from 'react-router-dom';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  phone: '',
  // Usamos el rol "restaurant" por defecto para este módulo PRO
  role: 'restaurant', 
  creditDays: 0,
};

export default function AdminClientesPRO() {
  const { createAlianzaUser } = usePedido(); // Usaremos la función existente de creación de usuario
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (form.password.length < 6) {
        throw new Error("La contraseña debe tener al menos 6 caracteres.");
      }

      // Reutilizamos createAlianzaUser, pero pasamos el rol 'restaurant'
      // createAlianzaUser crea el usuario en Firebase Auth y el doc en Firestore /users.
      const newUid = await createAlianzaUser({
        email: form.email,
        password: form.password,
        nombre: form.name,
        telefono: form.phone,
        // PASAMOS EL ROL CLAVE: 'restaurant'
        role: form.role, 
        // Otros campos que necesites, como crédito, etc.
        credito: { cupo: Number(form.creditDays) || 0, usado: 0 },
      });

      setSuccessMsg(`Cliente PRO (${form.name}) creado con éxito. UID: ${newUid}`);
      setForm(emptyForm); // Limpiar el formulario
      
    } catch (err) {
      console.error("Error creando cliente PRO:", err);
      setErrorMsg(err.message || 'Error desconocido al crear el cliente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-lg shadow-xl">
      <h2 className="text-2xl font-bold text-green-700 mb-6">Crear Nuevo Cliente Mas Campo PRO (Restaurante)</h2>

      {successMsg && <div className="p-3 mb-4 text-sm text-green-700 bg-green-100 rounded">{successMsg}</div>}
      {errorMsg && <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded">{errorMsg}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Nombre del Restaurante */}
        <div>
          <label className="block text-sm text-gray-700 mb-1" htmlFor="name">Nombre del Restaurante / Contacto</label>
          <input
            type="text"
            id="name"
            name="name"
            value={form.name}
            onChange={handleInputChange}
            className="w-full border p-2 rounded-md"
            required
          />
        </div>

        {/* Email (Login) */}
        <div>
          <label className="block text-sm text-gray-700 mb-1" htmlFor="email">Correo Electrónico (Login)</label>
          <input
            type="email"
            id="email"
            name="email"
            value={form.email}
            onChange={handleInputChange}
            className="w-full border p-2 rounded-md"
            required
          />
        </div>

        {/* Contraseña */}
        <div>
          <label className="block text-sm text-gray-700 mb-1" htmlFor="password">Contraseña Temporal (Mín. 6 caracteres)</label>
          <input
            type="password"
            id="password"
            name="password"
            value={form.password}
            onChange={handleInputChange}
            className="w-full border p-2 rounded-md"
            required
          />
        </div>

        {/* Teléfono */}
        <div>
          <label className="block text-sm text-gray-700 mb-1" htmlFor="phone">Teléfono de Contacto</label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={form.phone}
            onChange={handleInputChange}
            className="w-full border p-2 rounded-md"
          />
        </div>

        {/* Días de Crédito (Reutilizando la lógica creditDays) */}
        <div>
          <label className="block text-sm text-gray-700 mb-1" htmlFor="creditDays">Días de Crédito (0 si es pago inmediato)</label>
          <input
            type="number"
            id="creditDays"
            name="creditDays"
            value={form.creditDays}
            onChange={handleInputChange}
            className="w-full border p-2 rounded-md"
          />
        </div>
        
        <button 
          type="submit" 
          disabled={loading}
          className="w-full px-4 py-2 mt-4 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition duration-150 disabled:bg-gray-400"
        >
          {loading ? 'Creando...' : 'Crear Cliente PRO y Acceso'}
        </button>
      </form>
    </div>
  );
}