// src/components/ProMenu.jsx

import React, { useState } from 'react';
import { usePedido } from '../context/PedidoContext';

// Asumo que tienes una función global de formato de dinero (ej: un helper 'fmt')
// Si no la tienes, puedes usar .toLocaleString() directamente
const fmt = (n) => (Number(n) || 0).toLocaleString("es-CO", { 
    style: 'currency', 
    currency: 'COP', 
    minimumFractionDigits: 0 
});


export default function ProMenu() {
    const { menu, addPedidoPendiente, role } = usePedido();
    const [quantities, setQuantities] = useState({}); // Estado para manejar cantidades del carrito
    const [searchTerm, setSearchTerm] = useState('');
    
    // Filtramos solo productos que son visibles y que coincidan con la búsqueda
    const items = menu?.items
        .filter(i => i.isVisible)
        .filter(i => 
            !searchTerm || 
            i.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
            i.category?.toLowerCase().includes(searchTerm.toLowerCase())
        ) || [];

    // Esta función se encarga de cambiar la cantidad del input
    const handleQuantityChange = (itemId, change) => {
        const currentQty = quantities[itemId] || 0;
        let newQty = currentQty + change;
        if (newQty < 0) newQty = 0;
        
        setQuantities(prev => ({
            ...prev,
            [itemId]: newQty
        }));
    };

    // Función para añadir el producto al carrito (PedidoContext)
    const handleAddToCart = (item) => {
        const qty = quantities[item.id] || 0;
        if (qty > 0) {
            addPedidoPendiente({
                // Estructura del ítem de tu carrito
                id: item.id,
                name: item.name,
                price: item.price, // ¡Este ya es el precio B2B gracias al Contexto!
                quantity: qty,
                unit: item.unit
            });
            // Limpiar la cantidad después de agregar al carrito
            setQuantities(prev => ({ ...prev, [item.id]: 0 })); 
        }
    };
    
    if (!menu) return <div className="text-center p-8 text-gray-500">Cargando menú PRO...</div>;

    return (
        <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-700">Catálogo de Productos Mas Campo PRO</h3>
            
            {/* Barra de Búsqueda */}
            <input
                type="text"
                placeholder="Buscar fruta, verdura o categoría..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
            />

            <div className="bg-gray-100 p-3 rounded-lg text-sm font-medium text-gray-700">
                ¡Atención! Estos son sus precios especiales de Restaurante.
            </div>

            {/* Tabla de Productos B2B (Diseño limpio y funcional) */}
            <div className="overflow-x-auto shadow-md rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-green-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unidad</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio B2B</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                            <th className="px-6 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {items.map((item) => (
                            <tr key={item.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {item.name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {item.unit}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-700">
                                    {fmt(item.price)} 
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                    {/* Selector de Cantidad */}
                                    <div className="flex items-center justify-center space-x-2">
                                        <button 
                                            onClick={() => handleQuantityChange(item.id, -1)}
                                            className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 text-lg"
                                        >
                                            -
                                        </button>
                                        <input
                                            type="number"
                                            value={quantities[item.id] || 0}
                                            onChange={(e) => setQuantities(prev => ({ ...prev, [item.id]: Number(e.target.value) || 0 }))}
                                            className="w-16 text-center border rounded-md"
                                            min="0"
                                            inputMode="numeric"
                                        />
                                        <button 
                                            onClick={() => handleQuantityChange(item.id, 1)}
                                            className="w-8 h-8 rounded-full bg-green-200 hover:bg-green-300 text-lg text-green-800"
                                        >
                                            +
                                        </button>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        onClick={() => handleAddToCart(item)}
                                        disabled={(quantities[item.id] || 0) === 0}
                                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-400"
                                    >
                                        Añadir
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {items.length === 0 && (
                            <tr>
                                <td colSpan={5} className="text-center py-4 text-gray-500">
                                    {searchTerm ? "No se encontraron productos." : "No hay productos visibles en el menú."}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}