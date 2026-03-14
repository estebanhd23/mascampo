// src/components/Admin/AdminMenuB2B.jsx

import React, { useState, useEffect } from 'react';
import { db } from '../../firebase'; 
import { doc, getDoc, updateDoc } from 'firebase/firestore';

// 🛑🛑🛑 VERIFICA ESTE ID EN TU CONSOLA DE FIRESTORE 🛑🛑🛑
const MENU_DOC_ID = 'config'; 

// 🎯 CONSTANTE DE DESCUENTO (20% OFF)
const DISCOUNT_RATE = 0.20; 

const AdminMenuB2B = () => {
  const [fruverItems, setFruverItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  // Función de formato de dinero (ajusta si es necesario)
  const fmt = (n) => (Number(n) || 0).toLocaleString("es-CO");
  
  // 1. Cargar solo los productos 'fruver'
  useEffect(() => {
    const fetchFruverMenu = async () => {
      try {
        const menuRef = doc(db, "menu", MENU_DOC_ID);
        const snap = await getDoc(menuRef);
        const data = snap.data();
        
        if (data && Array.isArray(data.fruver)) {
          const items = data.fruver.map(item => {
            const priceB2C = item.price || 0; 
            
            // 🛑 CÁLCULO CENTRAL: 20% de descuento sobre el precio público
            const calculatedPrice = Math.round(priceB2C * (1 - DISCOUNT_RATE)); 

            return { 
              ...item, 
              price_b2c: priceB2C, // Precio público para referencia
              // Usar el precio B2B guardado si existe, de lo contrario, usar el precio calculado
              currentPrice: item.price_b2b || calculatedPrice, 
              suggestedPrice: calculatedPrice // Guardar el sugerido para referencia visual
            };
          });
          setFruverItems(items);
        } else {
            console.error(`Documento de menú ${MENU_DOC_ID} no contiene el array 'fruver'.`);
            setFruverItems([]);
        }
      } catch (e) {
        console.error("Error al cargar menú Fruver (Verifique ID):", e);
        setFruverItems([]);
      } finally {
        setLoading(false);
      }
    };
    fetchFruverMenu();
  }, []);

  // 2. Manejar el cambio de precio en el input
  const handlePriceChange = (id, newPrice) => {
    setFruverItems(prevItems =>
      prevItems.map(item =>
        item.id === id ? { ...item, currentPrice: parseFloat(newPrice) || 0 } : item
      )
    );
  };

  // 3. Guardar el precio actualizado en Firestore
  const handleSavePrice = async (item) => {
    if (updatingId) return;
    setUpdatingId(item.id);
    
    const newPriceB2B = item.currentPrice;

    try {
      const menuRef = doc(db, "menu", MENU_DOC_ID);
      const snap = await getDoc(menuRef);
      const data = snap.data();
      
      if (!data || !Array.isArray(data.fruver)) {
        throw new Error("Estructura de menú Fruver inválida.");
      }

      const updatedFruver = data.fruver.map(fruverItem => {
        if (fruverItem.id === item.id) {
          return {
            ...fruverItem,
            price_b2b: newPriceB2B // <-- ESTABLECE EL PRECIO B2B
          };
        }
        return fruverItem;
      });

      await updateDoc(menuRef, {
        fruver: updatedFruver,
        updatedAt: new Date(),
      });
      
      alert(`Precio B2B de ${item.name} guardado correctamente.`);
      
    } catch (error) {
      console.error("Error al actualizar precio:", error);
      alert(`Error al guardar el precio: ${error.message}`);
    } finally {
      setUpdatingId(null);
    }
  };


  if (loading) return <div className="text-center p-8">Cargando Menú PRO...</div>;

  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold text-green-700 mb-2">Administración de Precios B2B (Catálogo PRO)</h2>
      <p className="text-gray-600 mb-6">Establezca los precios especiales que verán los restaurantes en su Panel PRO.</p>

      {fruverItems.length === 0 && !loading && (
         <div className="p-4 bg-red-100 border border-red-400 rounded-lg text-red-800 font-semibold">
             <p>🚨 **Error de Configuración:** No se encontraron productos Fruver. Verifique el ID de su documento de menú en Firestore.</p>
         </div>
      )}

      <table className="min-w-full bg-white rounded-lg shadow-lg">
        <thead className="bg-green-100 border-b border-green-200">
          <tr>
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Producto</th>
            <th className="py-3 px-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unidad</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Precio B2C (Público)</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Precio B2B (Nuevo)</th>
            <th className="py-3 px-4"></th>
          </tr>
        </thead>
        <tbody>
          {fruverItems.map(item => (
            <tr key={item.id} className="border-b hover:bg-gray-50">
              <td className="py-3 px-4 text-gray-800 font-medium">{item.name}</td>
              <td className="py-3 px-4 text-gray-500">{item.unit}</td>
              <td className="px-6 py-4 text-gray-500 font-semibold">
                  <span className="text-xs text-gray-400">Público:</span> ${fmt(item.price_b2c)}
              </td>
              <td className="py-3 px-4">
                <input
                  type="number"
                  step="1"
                  value={item.currentPrice}
                  onChange={(e) => handlePriceChange(item.id, e.target.value)}
                  className="p-2 border border-gray-300 rounded-md w-32 focus:ring-green-500 focus:border-green-500"
                />
                {/* Muestra la etiqueta si el precio es el calculado y aún no se ha guardado un precio B2B */}
                {item.price_b2b === undefined && item.currentPrice === item.suggestedPrice && (
                  <p className="text-xs text-green-600 mt-1">
                    (Sugerido: 20% OFF)
                  </p>
                )}
              </td>
              <td className="py-3 px-4 text-right">
                <button
                  onClick={() => handleSavePrice(item)}
                  disabled={updatingId === item.id}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition duration-150 disabled:bg-gray-400"
                >
                  {updatingId === item.id ? 'Guardando...' : 'Guardar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminMenuB2B;