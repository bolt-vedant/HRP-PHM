import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { getEmployee, getOwner } from '../lib/auth';
import { SalesData } from './SalesForm';
import { ArrowLeft, Download, Save, Upload, X } from 'lucide-react';
import { sendDiscordNotification } from '../lib/discord';
import Toast from './Toast';

interface BillSummaryProps {
  salesData: SalesData;
  onBack: () => void;
  onComplete: () => void;
  onDashboard: () => void;
}

export default function BillSummary({ salesData, onBack, onComplete, onDashboard }: BillSummaryProps) {
  const [discount, setDiscount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error'; icon?: 'discord' | 'default' }>>([]);
  const [carImage, setCarImage] = useState<File | null>(null);
  const [mechanicSheet, setMechanicSheet] = useState<File | null>(null);
  const [carImagePreview, setCarImagePreview] = useState<string | null>(null);
  const [mechanicSheetPreview, setMechanicSheetPreview] = useState<string | null>(null);
  const employee = getEmployee();
  const owner = getOwner();
  const isOwner = !!(owner && employee && owner.discord_id === employee.discord_id);

  const subtotal = salesData.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountAmount = (subtotal * discount) / 100;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * 0.14;
  const total = afterDiscount + taxAmount;

  // Function to add toast notification
  const addToast = (message: string, type: 'success' | 'error', icon: 'discord' | 'default' = 'default') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type, icon }]);
  };

  // Function to remove toast
  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  // Handle image selection
  const handleCarImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCarImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setCarImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMechanicSheetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMechanicSheet(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setMechanicSheetPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Remove image
  const removeCarImage = () => {
    setCarImage(null);
    setCarImagePreview(null);
  };

  const removeMechanicSheet = () => {
    setMechanicSheet(null);
    setMechanicSheetPreview(null);
  };

  const saveBillToDatabase = async () => {
    if (!employee) throw new Error('No employee found');

    const hasVerificationImages = !!(carImage && mechanicSheet);

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        employee_id: employee.id,
        customer_name: salesData.customerName,
        vehicle_plate: salesData.vehiclePlate,
        discount_percentage: discount,
        subtotal: subtotal,
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        total_amount: total,
        is_verified: isOwner || hasVerificationImages,
        verified_at: (isOwner || hasVerificationImages) ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (saleError) throw saleError;

    const items = salesData.items.map((item) => ({
      sale_id: sale.id,
      item_name: item.name,
      item_category: item.category,
      item_type: item.type,
      quantity: item.quantity,
      price: item.price,
      subtotal: item.price * item.quantity,
    }));

    const { error: itemsError } = await supabase.from('sale_items').insert(items);

    if (itemsError) throw itemsError;

    return sale;
  };

  const handleSaveBill = async () => {
    setSaving(true);

    try {
      const sale = await saveBillToDatabase();
      
      // Show success toast for bill saved
      addToast('Bill saved successfully!', 'success');
      
      // Send Discord notification
      if (employee) {
        const billDate = new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const hasVerificationImages = !!(carImage && mechanicSheet);

        const discordMessageId = await sendDiscordNotification(
          {
            saleId: sale.id,
            date: billDate,
            mechanicName: employee.character_name,
            mechanicDiscordId: employee.discord_id,
            customerName: salesData.customerName,
            plateNumber: salesData.vehiclePlate,
            totalItems: salesData.items.length,
            amount: total,
            items: salesData.items
          },
          employee.id,
          isOwner || hasVerificationImages,
          hasVerificationImages ? { carImage, mechanicSheet } : undefined
        );

        // Update sale with Discord message ID
        if (discordMessageId) {
          await supabase
            .from('sales')
            .update({ discord_message_id: discordMessageId })
            .eq('id', sale.id);
          addToast('Bill uploaded to Discord successfully!', 'success', 'discord');
        } else {
          addToast('Failed to upload bill to Discord', 'error', 'discord');
        }
      }
      
      addToast('Redirecting to dashboard...', 'success');
      setTimeout(() => onComplete(), 500);
    } catch (error) {
      console.error('Error saving sale:', error);
      addToast('Failed to save bill. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePDF = async () => {
    setSaving(true);

    try {
      // Save to database first
      const sale = await saveBillToDatabase();
      
      // Show success toast for bill saved
      addToast('Bill saved successfully!', 'success');
      
      // Send Discord notification
      if (employee) {
        const billDate = new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const hasVerificationImages = !!(carImage && mechanicSheet);

        const discordMessageId = await sendDiscordNotification(
          {
            saleId: sale.id,
            date: billDate,
            mechanicName: employee.character_name,
            mechanicDiscordId: employee.discord_id,
            customerName: salesData.customerName,
            plateNumber: salesData.vehiclePlate,
            totalItems: salesData.items.length,
            amount: total,
            items: salesData.items
          },
          employee.id,
          isOwner || hasVerificationImages,
          hasVerificationImages ? { carImage, mechanicSheet } : undefined
        );

        // Update sale with Discord message ID
        if (discordMessageId) {
          await supabase
            .from('sales')
            .update({ discord_message_id: discordMessageId })
            .eq('id', sale.id);
          addToast('Bill uploaded to Discord successfully!', 'success', 'discord');
        } else {
          addToast('Failed to upload bill to Discord', 'error', 'discord');
        }
      }
      
      // Then download PDF
      downloadPDF();
      
      addToast('Redirecting to dashboard...', 'success');
      setTimeout(() => onComplete(), 500);
    } catch (error) {
      console.error('Error saving PDF:', error);
      addToast('Failed to save PDF. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const downloadPDF = () => {
    const currentDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const currentTime = new Date().toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Dragon Auto Shop - Invoice #${Date.now().toString().slice(-6)}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Roboto:wght@300;400;500;700&display=swap');
          
          @media print {
            @page { 
              size: A4;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
            }
            .no-print {
              display: none !important;
            }
          }
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Roboto', Arial, sans-serif;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a0a0a 50%, #0a0a0a 100%);
            color: #fff;
            padding: 20px;
            min-height: 100vh;
          }
          
          .container {
            max-width: 850px;
            margin: 0 auto;
            background: linear-gradient(135deg, #1a1a1a 0%, #2a1a1a 100%);
            border: 3px solid;
            border-image: linear-gradient(135deg, #dc2626, #991b1b, #dc2626) 1;
            box-shadow: 0 0 50px rgba(220, 38, 38, 0.3), inset 0 0 50px rgba(220, 38, 38, 0.05);
            position: relative;
            overflow: hidden;
          }
          
          .container::before {
            content: '';
            position: absolute;
            top: -50%;
            right: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(220, 38, 38, 0.1) 0%, transparent 70%);
            animation: rotate 20s linear infinite;
          }
          
          @keyframes rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          
          .content {
            position: relative;
            z-index: 1;
            padding: 40px;
          }
          
          .header {
            text-align: center;
            padding-bottom: 30px;
            margin-bottom: 40px;
            border-bottom: 3px solid;
            border-image: linear-gradient(90deg, transparent, #dc2626, transparent) 1;
            position: relative;
          }
          
          .dragon-symbol {
            width: 80px;
            height: 80px;
            margin: 0 auto 10px;
          }
          
          .header h1 {
            font-family: 'Orbitron', 'Arial Black', sans-serif;
            color: #dc2626 !important;
            margin: 10px 0;
            font-size: 42px;
            font-weight: 900;
            letter-spacing: 4px;
            opacity: 1 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          .header .subtitle {
            color: #ef4444;
            margin: 8px 0;
            font-size: 18px;
            font-weight: 500;
            letter-spacing: 3px;
            text-transform: uppercase;
          }
          
          .header .server {
            color: #9ca3af;
            font-size: 13px;
            letter-spacing: 2px;
            margin-top: 5px;
          }
          
          .invoice-meta {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
            padding: 20px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 8px;
            border-left: 4px solid #dc2626;
          }
          
          .invoice-meta div {
            flex: 1;
          }
          
          .invoice-meta label {
            display: block;
            color: #ef4444;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1.5px;
            margin-bottom: 6px;
            text-transform: uppercase;
          }
          
          .invoice-meta p {
            color: #fff;
            font-size: 16px;
            font-weight: 500;
          }
          
          .info-section {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            margin-bottom: 35px;
          }
          
          .info-box {
            background: rgba(220, 38, 38, 0.1);
            padding: 18px;
            border-radius: 8px;
            border: 1px solid rgba(220, 38, 38, 0.3);
            transition: all 0.3s ease;
          }
          
          .info-box:hover {
            background: rgba(220, 38, 38, 0.15);
            border-color: rgba(220, 38, 38, 0.5);
          }
          
          .info-box label {
            display: block;
            color: #ef4444;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1.5px;
            margin-bottom: 8px;
            text-transform: uppercase;
          }
          
          .info-box p {
            color: #fff;
            font-size: 18px;
            font-weight: 500;
          }
          
          table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            margin-bottom: 25px;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
          }
          
          thead {
            background: linear-gradient(135deg, #dc2626, #991b1b);
          }
          
          th {
            color: #fff;
            padding: 16px 12px;
            text-align: left;
            font-weight: 700;
            font-size: 12px;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          }
          
          th:last-child,
          td:last-child {
            text-align: right;
          }
          
          th:nth-child(3),
          td:nth-child(3) {
            text-align: center;
          }
          
          tbody tr {
            background: rgba(0, 0, 0, 0.2);
            transition: all 0.2s ease;
          }
          
          tbody tr:nth-child(even) {
            background: rgba(0, 0, 0, 0.3);
          }
          
          tbody tr:hover {
            background: rgba(220, 38, 38, 0.1);
          }
          
          td {
            padding: 14px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            font-size: 14px;
          }
          
          td:first-child {
            font-weight: 500;
            color: #fff;
          }
          
          td:not(:first-child):not(:last-child) {
            color: #d1d5db;
          }
          
          td:last-child {
            color: #dc2626;
            font-weight: 700;
            font-size: 15px;
          }
          
          .summary {
            background: rgba(0, 0, 0, 0.3);
            padding: 25px;
            border-radius: 8px;
            margin-top: 30px;
          }
          
          .summary-row {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            margin: 12px 0;
            font-size: 16px;
          }
          
          .summary-label {
            margin-right: 30px;
            color: #9ca3af;
            font-weight: 500;
            min-width: 120px;
            text-align: right;
          }
          
          .summary-value {
            min-width: 180px;
            text-align: right;
            color: #fff;
            font-weight: 600;
            font-size: 18px;
          }
          
          .total-row {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 2px solid;
            border-image: linear-gradient(90deg, transparent, #dc2626, transparent) 1;
          }
          
          .total-row .summary-label {
            color: #ef4444;
            font-weight: 700;
            font-size: 20px;
            letter-spacing: 2px;
          }
          
          .total-row .summary-value {
            color: #dc2626;
            font-weight: 900;
            font-size: 32px;
            text-shadow: 0 0 10px rgba(220, 38, 38, 0.5);
            font-family: 'Orbitron', sans-serif;
          }
          
          .footer {
            margin-top: 50px;
            padding-top: 30px;
            border-top: 2px solid;
            border-image: linear-gradient(90deg, transparent, #dc2626, transparent) 1;
            text-align: center;
          }
          
          .footer p {
            color: #6b7280;
            font-size: 13px;
            margin: 8px 0;
          }
          
          .footer .thank-you {
            font-size: 16px;
            color: #9ca3af;
            font-weight: 500;
            margin-bottom: 15px;
          }
          
          .footer .mechanic {
            color: #ef4444;
            font-weight: 600;
            font-size: 14px;
          }
          
          .print-button {
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: linear-gradient(135deg, #dc2626, #991b1b);
            color: white;
            border: none;
            padding: 15px 30px;
            font-size: 16px;
            font-weight: 700;
            border-radius: 8px;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(220, 38, 38, 0.4);
            transition: all 0.3s ease;
            letter-spacing: 1px;
            z-index: 1000;
          }
          
          .print-button:hover {
            background: linear-gradient(135deg, #991b1b, #7f1d1d);
            box-shadow: 0 6px 20px rgba(220, 38, 38, 0.6);
            transform: translateY(-2px);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <div class="header">
              <img src="/logo.png" alt="Dragon Logo" class="dragon-symbol" />
              <h1>DRAGON AUTO SHOP</h1>
              <p class="subtitle">Customization Invoice</p>
              <p class="server">HYDRA ROLEPLAY - HRP</p>
            </div>

            <div class="invoice-meta">
              <div>
                <label>Invoice Number</label>
                <p>#DRG-${Date.now().toString().slice(-6)}</p>
              </div>
              <div>
                <label>Date</label>
                <p>${currentDate}</p>
              </div>
              <div>
                <label>Time</label>
                <p>${currentTime}</p>
              </div>
            </div>

            <div class="info-section">
              <div class="info-box">
                <label>Customer Name</label>
                <p>${salesData.customerName}</p>
              </div>
              <div class="info-box">
                <label>Vehicle Plate</label>
                <p>${salesData.vehiclePlate}</p>
              </div>
              <div class="info-box">
                <label>Mechanic Discount</label>
                <p>${discount}%</p>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Part Name</th>
                  <th>Type / Level</th>
                  <th>Qty</th>
                  <th>Unit Price</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${salesData.items
                  .map(
                    (item) => `
                  <tr>
                    <td>${item.name}</td>
                    <td>${item.type}</td>
                    <td>${item.quantity}</td>
                    <td>$${item.price.toLocaleString()}</td>
                    <td>$${(item.price * item.quantity).toLocaleString()}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>

            <div class="summary">
              <div class="summary-row">
                <span class="summary-label">Subtotal:</span>
                <span class="summary-value">$${subtotal.toLocaleString()}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">Discount (${discount}%):</span>
                <span class="summary-value">-$${discountAmount.toLocaleString()}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">Tax (14%):</span>
                <span class="summary-value">+$${taxAmount.toLocaleString()}</span>
              </div>
              <div class="summary-row total-row">
                <span class="summary-label">TOTAL:</span>
                <span class="summary-value">$${total.toLocaleString()}</span>
              </div>
            </div>

            <div class="footer">
              <div style="text-align: center; margin-bottom: 10px;">
                <img src="/logo.png" alt="Dragon Logo" style="width: 40px; height: 40px; display: inline-block;" />
              </div>
              <p class="thank-you">Thank you for choosing Dragon Auto Shop!</p>
              <p class="mechanic">Mechanic: ${employee?.character_name || 'N/A'}</p>
              <p>For inquiries, contact us at Dragon Auto Shop - Hydra Roleplay</p>
            </div>
          </div>
        </div>
        
        <button class="print-button no-print" onclick="window.print()">🖨️ PRINT INVOICE</button>
        </div>
      </body>
      </html>
    `;

    // Open in new window for preview and printing
    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      // Focus the new window
      printWindow.focus();
    } else {
      alert('Please allow pop-ups to view the invoice.');
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${Math.round(amount).toLocaleString()}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-red-950 to-gray-900">
      {/* Toast Notifications */}
      {toasts.map((toast, index) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          icon={toast.icon}
          index={index}
          onClose={() => removeToast(toast.id)}
        />
      ))}

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
                <h1 className="text-2xl font-bold text-red-500">DRAGON AUTO SHOP - CUSTOMIZATION BILL</h1>
                <p className="text-xs text-gray-400">Hydra Roleplay</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl px-4 py-8 mx-auto sm:px-6 lg:px-8">
          <div className="p-8 border-2 rounded-lg bg-black/80 backdrop-blur-md border-red-600/50">
            <div className="grid grid-cols-1 gap-6 mb-6 md:grid-cols-3">
              <div>
                <label className="block mb-2 text-sm font-semibold text-red-400">Customer Name</label>
                <div className="px-4 py-3 text-white border rounded bg-gray-900/50 border-red-600/30">
                  {salesData.customerName}
                </div>
              </div>
              <div>
                <label className="block mb-2 text-sm font-semibold text-red-400">Vehicle</label>
                <div className="px-4 py-3 text-white border rounded bg-gray-900/50 border-red-600/30">
                  {salesData.vehiclePlate}
                </div>
              </div>
              <div>
                <label className="block mb-2 text-sm font-semibold text-red-400">Mechanic Discount %</label>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Math.max(0, Math.min(100, Number(e.target.value))))}
                  className="w-full px-4 py-3 text-white border rounded bg-gray-900/50 border-red-600/30 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                  min="0"
                  max="100"
                />
              </div>
            </div>

            <div className="mb-6 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-red-600">
                    <th className="px-4 py-3 font-bold text-left text-white">PART</th>
                    <th className="px-4 py-3 font-bold text-left text-white">TYPE / LEVEL</th>
                    <th className="px-4 py-3 font-bold text-center text-white">QTY</th>
                    <th className="px-4 py-3 font-bold text-right text-white">PRICE ($)</th>
                    <th className="px-4 py-3 font-bold text-right text-white">SUBTOTAL</th>
                  </tr>
                </thead>
                <tbody className="bg-black/60">
                  {salesData.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-red-600/20 hover:bg-red-900/10">
                      <td className="px-4 py-3 text-white">{item.name}</td>
                      <td className="px-4 py-3 text-gray-300">{item.type}</td>
                      <td className="px-4 py-3 text-center text-gray-300">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-300">
                        {item.price.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-bold text-right text-red-500">
                        {formatCurrency(item.price * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-6 text-right rounded-lg bg-black/60">
              <div className="space-y-3 text-lg">
                <div className="flex items-center justify-end">
                  <span className="mr-8 text-gray-400">Subtotal:</span>
                  <span className="text-white min-w-[150px]">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex items-center justify-end">
                  <span className="mr-8 text-gray-400">Discount:</span>
                  <span className="text-white min-w-[150px]">-{formatCurrency(discountAmount)}</span>
                </div>
                <div className="flex items-center justify-end">
                  <span className="mr-8 text-gray-400">Tax (14%):</span>
                  <span className="text-white min-w-[150px]">+{formatCurrency(taxAmount)}</span>
                </div>
                <div className="flex items-center justify-end pt-4 mt-4 border-t-2 border-red-600">
                  <span className="mr-8 text-2xl font-bold text-red-400">Total:</span>
                  <span className="text-red-500 font-bold text-3xl min-w-[150px]">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>
            </div>

            {/* Verification Images Upload Section */}
            <div className="p-6 mt-6 border-2 rounded-lg border-green-600/50 bg-green-900/20">
              <h3 className="mb-4 text-xl font-bold text-green-400">📸 Verification Images (Optional)</h3>
              <p className="mb-4 text-sm text-gray-300">Upload verification images to auto-verify this bill</p>
              
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Car Image Upload */}
                <div>
                  <label className="block mb-2 text-sm font-semibold text-green-400">Car Image</label>
                  {carImagePreview ? (
                    <div className="relative">
                      <img src={carImagePreview} alt="Car preview" className="object-cover w-full h-48 border-2 rounded border-green-600/50" />
                      <button
                        onClick={removeCarImage}
                        className="absolute p-1 transition bg-red-600 rounded-full top-2 right-2 hover:bg-red-700"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-48 transition border-2 border-dashed rounded cursor-pointer border-green-600/50 hover:border-green-500 hover:bg-green-900/10">
                      <Upload className="w-8 h-8 mb-2 text-green-400" />
                      <span className="text-sm text-gray-300">Click to upload car image</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleCarImageChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                {/* Mechanic Sheet Upload */}
                <div>
                  <label className="block mb-2 text-sm font-semibold text-green-400">Mechanic Sheet</label>
                  {mechanicSheetPreview ? (
                    <div className="relative">
                      <img src={mechanicSheetPreview} alt="Mechanic sheet preview" className="object-cover w-full h-48 border-2 rounded border-green-600/50" />
                      <button
                        onClick={removeMechanicSheet}
                        className="absolute p-1 transition bg-red-600 rounded-full top-2 right-2 hover:bg-red-700"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-48 transition border-2 border-dashed rounded cursor-pointer border-green-600/50 hover:border-green-500 hover:bg-green-900/10">
                      <Upload className="w-8 h-8 mb-2 text-green-400" />
                      <span className="text-sm text-gray-300">Click to upload mechanic sheet</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleMechanicSheetChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {carImage && mechanicSheet && (
                <div className="p-3 mt-4 border rounded bg-green-600/20 border-green-600/50">
                  <p className="text-sm text-center text-green-300">✅ Both images uploaded - Bill will be auto-verified when saved</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-8">
            <button
              onClick={onBack}
              disabled={saving}
              className="flex items-center px-6 py-3 space-x-2 font-bold text-white transition-all bg-gray-800 rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>BACK</span>
            </button>

            <div className="flex items-center space-x-4">
              <button
                onClick={handleSaveBill}
                disabled={saving}
                className="flex items-center px-6 py-3 space-x-2 font-bold text-white transition-all transform rounded shadow-lg bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                <Save className="w-5 h-5" />
                <span>{saving ? 'SAVING...' : 'SAVE BILL'}</span>
              </button>
              
              <button
                onClick={handleSavePDF}
                disabled={saving}
                className="flex items-center px-6 py-3 space-x-2 font-bold text-white transition-all transform rounded shadow-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                <Download className="w-5 h-5" />
                <span>{saving ? 'SAVING...' : 'SAVE PDF'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
