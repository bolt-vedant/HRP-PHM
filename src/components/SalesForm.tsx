import { useState, useEffect } from 'react';
import { categories } from '../lib/items';
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';

interface SalesFormProps {
  onNext: (data: SalesData) => void;
  onBack: () => void;
  onDashboard: () => void;
  initialData?: SalesData | null;
}

export interface SelectedItem {
  name: string;
  category: string;
  type: string;
  price: number;
  quantity: number;
}

export interface SalesData {
  customerName: string;
  vehiclePlate: string;
  items: SelectedItem[];
}

export default function SalesForm({ onNext, onBack, onDashboard, initialData }: SalesFormProps) {
  const [customerName, setCustomerName] = useState(initialData?.customerName || '');
  const [vehiclePlate, setVehiclePlate] = useState(initialData?.vehiclePlate || '');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>(initialData?.items || []);

  useEffect(() => {
    if (initialData) {
      setCustomerName(initialData.customerName);
      setVehiclePlate(initialData.vehiclePlate);
      setSelectedItems(initialData.items);
    }
  }, [initialData]);

  const handleItemToggle = (itemName: string, category: string, level: string, price: number, isPerformanceUpgrade: boolean = false) => {
    const itemKey = `${itemName}-${level}`;
    const existing = selectedItems.find((item) => `${item.name}-${item.type}` === itemKey);

    if (existing) {
      // If clicking the same item, deselect it
      setSelectedItems(selectedItems.filter((item) => `${item.name}-${item.type}` !== itemKey));
    } else {
      if (isPerformanceUpgrade) {
        // For performance upgrades with radio buttons, remove any other level of the same upgrade
        const filteredItems = selectedItems.filter((item) => item.name !== itemName);
        setSelectedItems([...filteredItems, { name: itemName, category, type: level, price, quantity: 1 }]);
      } else {
        // For regular items (checkboxes), just add or remove
        setSelectedItems([...selectedItems, { name: itemName, category, type: level, price, quantity: 1 }]);
      }
    }
  };

  const handleReset = () => {
    setSelectedItems([]);
  };

  const isItemSelected = (itemName: string, level: string) => {
    return selectedItems.some((item) => item.name === itemName && item.type === level);
  };

  const handleNext = () => {
    if (customerName && vehiclePlate && selectedItems.length > 0) {
      onNext({ customerName, vehiclePlate, items: selectedItems });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-red-950 to-gray-900">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iIzk5MjIyMiIgc3Ryb2tlLXdpZHRoPSIuNSIgb3BhY2l0eT0iLjIiLz48L2c+PC9zdmc+')] opacity-20"></div>

      <div className="relative">
        <div className="border-b border-red-600/30 bg-black/60 backdrop-blur-md">
          <div className="px-4 py-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
            <div className="flex items-center space-x-3 cursor-pointer" onClick={onDashboard}>
              <div className="relative">
                <img src="/logo.png" alt="Dragon Auto Shop Logo" className="w-12 h-12 drop-shadow-[0_0_25px_rgba(218,165,32,0.8)]" />
                <div className="absolute inset-0 bg-yellow-500 opacity-40 blur-2xl"></div>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-red-500">NEW SALE</h1>
                <p className="text-xs text-gray-400">Select items and services</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-8 mx-auto max-w-7xl sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 mb-6 md:grid-cols-2">
            <div>
              <label className="block mb-2 text-sm font-semibold text-red-400">Customer Name</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-4 py-3 text-white placeholder-gray-600 border rounded bg-black/60 border-red-600/30 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                placeholder="Enter customer's character name"
              />
            </div>
            <div>
              <label className="block mb-2 text-sm font-semibold text-red-400">Vehicle Number Plate</label>
              <input
                type="text"
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 text-white placeholder-gray-600 uppercase border rounded bg-black/60 border-red-600/30 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                placeholder="Enter vehicle plate"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-3">
            {categories.map((category, idx) => (
              <div key={idx} className="p-6 border rounded-lg bg-black/60 backdrop-blur-md border-red-600/30">
                <h3 className="pb-2 mb-4 text-lg font-bold text-red-500 border-b border-red-600/30">
                  {idx + 1}. {category.name}
                </h3>
                <div className="space-y-3">
                  {category.items.map((item, itemIdx) => {
                    const isPerformanceCategory = category.name === 'Performance';
                    const isPerformanceUpgrade = isPerformanceCategory && !!item.levels;

                    return (
                      <div key={itemIdx}>
                        {item.levels ? (
                          <div>
                            <p className="mb-2 text-sm font-semibold text-white">{item.name}</p>
                            <div className="ml-2 space-y-1">
                              {item.levels.map((level, levelIdx) => (
                                <label
                                  key={levelIdx}
                                  className="flex items-center space-x-2 cursor-pointer group"
                                >
                                  <input
                                    type={isPerformanceUpgrade ? "radio" : "checkbox"}
                                    name={isPerformanceUpgrade ? item.name : undefined}
                                    checked={isItemSelected(item.name, level.level)}
                                    onChange={() =>
                                      handleItemToggle(item.name, category.name, level.level, level.price, isPerformanceUpgrade)
                                    }
                                    className={`w-4 h-4 bg-black border-red-600/50 text-red-600 focus:ring-red-500 focus:ring-offset-0 ${
                                      isPerformanceUpgrade ? '' : 'rounded'
                                    }`}
                                  />
                                  <span className={`text-sm transition-colors group-hover:text-red-400 ${isItemSelected(item.name, level.level) ? 'text-red-500 font-semibold' : 'text-gray-300'}`}>
                                    {level.level} (${level.price.toLocaleString()})
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <label className="flex items-center space-x-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={isItemSelected(item.name, 'Stock')}
                              onChange={() =>
                                handleItemToggle(item.name, category.name, 'Stock', item.price!, false)
                              }
                              className="w-4 h-4 text-red-600 bg-black rounded border-red-600/50 focus:ring-red-500 focus:ring-offset-0"
                            />
                            <span className={`text-sm transition-colors group-hover:text-red-400 ${isItemSelected(item.name, 'Stock') ? 'text-red-500 font-semibold' : 'text-white'}`}>
                              {item.name}
                            </span>
                            <span className={`ml-auto text-sm ${isItemSelected(item.name, 'Stock') ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                              ${item.price!.toLocaleString()}
                            </span>
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="flex items-center px-6 py-3 space-x-2 font-bold text-white transition-all bg-gray-800 rounded hover:bg-gray-700"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>BACK</span>
              </button>

              <button
                onClick={handleReset}
                disabled={selectedItems.length === 0}
                className="flex items-center px-6 py-3 space-x-2 font-bold text-white transition-all bg-orange-600 rounded hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw className="w-5 h-5" />
                <span>RESET</span>
              </button>
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-400">Selected Items</p>
              <p className="text-2xl font-bold text-red-500">{selectedItems.length}</p>
            </div>

            <button
              onClick={handleNext}
              disabled={!customerName || !vehiclePlate || selectedItems.length === 0}
              className="flex items-center px-6 py-3 space-x-2 font-bold text-white transition-all transform rounded bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              <span>NEXT</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
