import { useState, useEffect } from 'react';
import { supabase, Sale, SaleItem, Announcement } from '../lib/supabase';
import { getEmployee, clearEmployee } from '../lib/auth';
import { Users, DollarSign, Receipt, Plus, LogOut, Eye, Download, Trash2, Zap, CheckCircle } from 'lucide-react';
import { sendDiscordNotification, editDiscordMessage, deleteDiscordMessage } from '../lib/discord';
import Toast from './Toast';
import VerifyBillModal from './VerifyBillModal';

interface DashboardProps {
  onNewSale: () => void;
  onLogout: () => void;
}

export default function Dashboard({ onNewSale, onLogout }: DashboardProps) {
  const [customerCount, setCustomerCount] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [allSales, setAllSales] = useState<Sale[]>([]);
  const [showAllTransactions, setShowAllTransactions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewingSale, setViewingSale] = useState<Sale | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [deletingSale, setDeletingSale] = useState<Sale | null>(null);
  const [showDeleteSaleDialog, setShowDeleteSaleDialog] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error'; icon?: 'discord' | 'default' }>>([]);
  const [verifyingSale, setVerifyingSale] = useState<Sale | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hideVerificationAlert, setHideVerificationAlert] = useState(false);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const employee = getEmployee();

  const addToast = (message: string, type: 'success' | 'error', icon: 'discord' | 'default' = 'default') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type, icon }]);
  };

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };
const getCookie = (name: string): string | null => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
  };

  const setCookie = (name: string, value: string, hours: number) => {
    const expires = new Date();
    expires.setTime(expires.getTime() + hours * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
  };

  const handleHideVerificationAlert = () => {
    setHideVerificationAlert(true);
    setCookie('hideVerificationAlert', 'true', 24);
  };

  useEffect(() => {
    const alertHidden = getCookie('hideVerificationAlert');
    if (alertHidden === 'true') {
      setHideVerificationAlert(true);
    }
  }, []);

  const loadAnnouncement = async () => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading announcement:', error);
        return;
      }

      setAnnouncement(data || null);
    } catch (error) {
      console.error('Error loading announcement:', error);
    }
  };

  useEffect(() => {
    if (!employee) return;

    loadDashboardData();
    loadAnnouncement();

    // Set up real-time subscription for sales updates
    const channel = supabase.channel(`sales-changes-${employee.id}`);
    
    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sales',
          filter: `employee_id=eq.${employee.id}`
        },
        (payload) => {
          console.log('Sales UPDATE detected for employee:', payload);
          loadDashboardData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sales',
          filter: `employee_id=eq.${employee.id}`
        },
        (payload) => {
          console.log('Sales INSERT detected for employee:', payload);
          loadDashboardData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'sales',
          filter: `employee_id=eq.${employee.id}`
        },
        (payload) => {
          console.log('Sales DELETE detected for employee:', payload);
          loadDashboardData();
        }
      )
      .subscribe((status) => {
        console.log('Subscription status for employee:', status);
      });

    const announcementSubscription = supabase
      .channel('employee-announcements')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'announcements'
        },
        () => {
          loadAnnouncement();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      announcementSubscription.unsubscribe();
    };
  }, [employee?.id]);

  const loadDashboardData = async () => {
    if (!employee) return;

    try {
      // Fetch sales first with a fresh query
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .eq('employee_id', employee.id)
        .order('created_at', { ascending: false });

      if (salesError) throw salesError;

      if (sales) {
        // Get item counts for each sale
        const salesWithCounts = await Promise.all(
          sales.map(async (sale) => {
            const { count } = await supabase
              .from('sale_items')
              .select('*', { count: 'exact', head: true })
              .eq('sale_id', sale.id);

            return {
              ...sale,
              item_count: count || 0
            };
          })
        );
        
        // Force state updates by creating new arrays
        const newAllSales = [...salesWithCounts];
        const newRecentSales = salesWithCounts.slice(0, 5);
        
        // Filter out fake sales for counting and total calculation
        const realSales = salesWithCounts.filter(sale => !sale.is_fake);
        
        setCustomerCount(salesWithCounts.length);
        setTotalSales(realSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0));
        setAllSales(newAllSales);
        setRecentSales(newRecentSales);
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearEmployee();
    onLogout();
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleViewSale = async (sale: Sale) => {
    try {
      const { data: items, error } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', sale.id);

      if (error) throw error;

      setSaleItems(items || []);
      setViewingSale(sale);
      setEditMode(true);
    } catch (error) {
      console.error('Error loading sale items:', error);
    }
  };

  const handleSavePDF = async (sale: Sale) => {
    try {
      const { data: items, error } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', sale.id);

      if (error) throw error;

      downloadPDF(sale, items || []);
    } catch (error) {
      console.error('Error loading sale for PDF:', error);
    }
  };

  const downloadPDF = (sale: Sale, items: SaleItem[]) => {
    const currentDate = new Date(sale.created_at).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const currentTime = new Date(sale.created_at).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    const subtotal = sale.subtotal || 0;
    const discountPercentage = sale.discount_percentage || 0;
    const discountAmount = sale.discount_amount || 0;
    const taxAmount = sale.tax_amount || 0;
    const total = sale.total_amount || 0;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Dragon Auto Shop - Invoice #${sale.id.substring(0, 8).toUpperCase()}</title>
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
                <p>#${sale.id.substring(0, 8).toUpperCase()}</p>
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
                <p>${sale.customer_name}</p>
              </div>
              <div class="info-box">
                <label>Vehicle Plate</label>
                <p>${sale.vehicle_plate}</p>
              </div>
              <div class="info-box">
                <label>Mechanic</label>
                <p>${employee?.character_name || 'N/A'}</p>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                ${items
                  .map(
                    (item) => `
                  <tr>
                    <td>${item.item_name}</td>
                    <td>${item.item_category}</td>
                    <td>$${Number(item.price).toLocaleString()}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>

            <div class="summary">
              <div class="summary-row">
                <span class="summary-label">Subtotal:</span>
                <span class="summary-value">$${Number(subtotal).toLocaleString()}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">Discount (${discountPercentage}%):</span>
                <span class="summary-value">-$${Number(discountAmount).toLocaleString()}</span>
              </div>
              <div class="summary-row">
                <span class="summary-label">Tax (14%):</span>
                <span class="summary-value">+$${Number(taxAmount).toLocaleString()}</span>
              </div>
              <div class="summary-row total-row">
                <span class="summary-label">TOTAL:</span>
                <span class="summary-value">$${Number(total).toLocaleString()}</span>
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
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
    } else {
      alert('Please allow pop-ups to view the invoice.');
    }
  };

  const handleUpdateBill = () => {
    setShowSaveConfirm(true);
  };

  const confirmUpdateBill = async () => {
    if (!viewingSale) return;

    setIsSaving(true);
    try {
      // Calculate new subtotal from current items (use subtotal field)
      const newSubtotal = saleItems.reduce((sum, item) => sum + Number(item.subtotal || item.price * item.quantity), 0);
      
      // Get discount percentage from the original sale
      const discountPercentage = viewingSale.discount_percentage || 0;
      
      // Calculate discount amount
      const discountAmount = (newSubtotal * discountPercentage) / 100;
      
      // Calculate after discount
      const afterDiscount = newSubtotal - discountAmount;
      
      // Calculate tax (14%)
      const taxAmount = afterDiscount * 0.14;
      
      // Calculate total
      const newTotal = afterDiscount + taxAmount;

      // Update sale with all recalculated values
      const { error: saleError } = await supabase
        .from('sales')
        .update({ 
          subtotal: newSubtotal,
          discount_amount: discountAmount,
          tax_amount: taxAmount,
          total_amount: newTotal
        })
        .eq('id', viewingSale.id);

      if (saleError) throw saleError;

      // Edit Discord message if message ID exists
      if (viewingSale.discord_message_id && employee) {
        const billDate = new Date(viewingSale.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const discordSuccess = await editDiscordMessage(
          viewingSale.discord_message_id,
          {
            saleId: viewingSale.id,
            date: billDate,
            mechanicName: employee.character_name,
            mechanicDiscordId: employee.discord_id,
            customerName: viewingSale.customer_name,
            plateNumber: viewingSale.vehicle_plate,
            totalItems: saleItems.length,
            amount: newTotal,
            items: saleItems.map(item => ({
              name: item.item_name,
              category: item.item_category,
              type: item.item_type,
              quantity: item.quantity,
              price: Number(item.price)
            }))
          },
          employee.id,
          viewingSale.is_fake
        );

        if (discordSuccess) {
          addToast('Bill updated on Discord successfully!', 'success', 'discord');
        } else {
          addToast('Failed to update bill on Discord', 'error', 'discord');
        }
      }

      // Reload dashboard data first to update the table
      await loadDashboardData();

      // Then close dialogs and edit mode
      setShowSaveConfirm(false);
      setViewingSale(null);
      setEditMode(false);
      setSaleItems([]);
    } catch (error) {
      console.error('Error updating bill:', error);
      alert('Failed to update bill. Please try again.');
      setShowSaveConfirm(false);
    }
  };

  const handleCloseView = () => {
    setViewingSale(null);
    setEditMode(false);
    setSaleItems([]);
  };

  const handleQuickBill = async () => {
    if (!employee) return;

    try {
      const customerName = 'Vehicle Repair';
      const vehiclePlate = 'REPAIR';
      const repairPrice = 500;
      const taxAmount = repairPrice * 0.14;
      const total = repairPrice + taxAmount;

      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          employee_id: employee.id,
          customer_name: customerName,
          vehicle_plate: vehiclePlate,
          discount_percentage: 0,
          subtotal: repairPrice,
          discount_amount: 0,
          tax_amount: taxAmount,
          total_amount: total,
          is_verified: true,
          verified_at: new Date().toISOString()
        })
        .select()
        .single();

      if (saleError) throw saleError;

      const { error: itemsError } = await supabase.from('sale_items').insert({
        sale_id: sale.id,
        item_name: 'Vehicle Repair',
        item_category: 'Repair',
        item_type: 'Standard',
        quantity: 1,
        price: repairPrice,
        subtotal: repairPrice,
      });

      if (itemsError) throw itemsError;

      addToast('Vehicle repair bill created successfully!', 'success');

      const billDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const discordMessageId = await sendDiscordNotification({
        saleId: sale.id,
        date: billDate,
        mechanicName: employee.character_name,
        mechanicDiscordId: employee.discord_id,
        customerName: customerName,
        plateNumber: vehiclePlate,
        totalItems: 1,
        amount: total,
        items: [{
          name: 'Vehicle Repair',
          category: 'Repair',
          type: 'Standard',
          quantity: 1,
          price: repairPrice
        }]
      }, employee.id, true);

      if (discordMessageId) {
        await supabase
          .from('sales')
          .update({ discord_message_id: discordMessageId })
          .eq('id', sale.id);
        addToast('Bill uploaded to Discord successfully!', 'success', 'discord');
      } else {
        addToast('Failed to upload bill to Discord', 'error', 'discord');
      }

      loadDashboardData();
    } catch (error) {
      console.error('Error creating repair bill:', error);
      addToast('Failed to create repair bill', 'error');
    }
  };

  const handleDeleteItem = (itemId: string) => {
    setItemToDelete(itemId);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteItem = async () => {
    if (!itemToDelete || !viewingSale) return;

    try {
      const { error } = await supabase
        .from('sale_items')
        .delete()
        .eq('id', itemToDelete);

      if (error) throw error;

      // Update local state
      const updatedItems = saleItems.filter(item => item.id !== itemToDelete);
      setSaleItems(updatedItems);

      // Recalculate sale totals with remaining items
      const newSubtotal = updatedItems.reduce((sum, item) => sum + Number(item.subtotal || item.price * item.quantity), 0);
      const discountPercentage = viewingSale.discount_percentage || 0;
      const discountAmount = (newSubtotal * discountPercentage) / 100;
      const afterDiscount = newSubtotal - discountAmount;
      const taxAmount = afterDiscount * 0.14;
      const newTotal = afterDiscount + taxAmount;

      // Update sale record in database
      const { error: saleError } = await supabase
        .from('sales')
        .update({ 
          subtotal: newSubtotal,
          discount_amount: discountAmount,
          tax_amount: taxAmount,
          total_amount: newTotal
        })
        .eq('id', viewingSale.id);

      if (saleError) throw saleError;

      // Update the sale in local state arrays immediately
      const updateSaleInArray = (sales: any[]) => 
        sales.map(s => s.id === viewingSale.id 
          ? { ...s, subtotal: newSubtotal, discount_amount: discountAmount, tax_amount: taxAmount, total_amount: newTotal, item_count: updatedItems.length }
          : s
        );

      setAllSales(updateSaleInArray(allSales));
      setRecentSales(updateSaleInArray(recentSales));
      
      // Recalculate total sales excluding fake sales
      const updatedAllSales = updateSaleInArray(allSales);
      const realSales = updatedAllSales.filter(sale => !sale.is_fake);
      setTotalSales(realSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0));

      // Update viewingSale state to reflect new totals in the modal
      setViewingSale({
        ...viewingSale,
        subtotal: newSubtotal,
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        total_amount: newTotal
      });

      setShowDeleteConfirm(false);
      setItemToDelete(null);
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item. Please try again.');
      setShowDeleteConfirm(false);
      setItemToDelete(null);
    }
  };

  const handleDeleteSale = (sale: Sale) => {
    setDeletingSale(sale);
    setShowDeleteSaleDialog(true);
  };

  const confirmDeleteSale = async () => {
    if (!deletingSale) return;

    setIsDeleting(true);
    try {
      // Delete Discord message if exists
      if (deletingSale.discord_message_id) {
        const discordSuccess = await deleteDiscordMessage(deletingSale.discord_message_id);
        if (discordSuccess) {
          addToast('Bill deleted from Discord successfully!', 'success', 'discord');
        } else {
          addToast('Failed to delete bill from Discord', 'error', 'discord');
        }
      }

      // First delete all sale items
      const { error: itemsError } = await supabase
        .from('sale_items')
        .delete()
        .eq('sale_id', deletingSale.id);

      if (itemsError) throw itemsError;

      // Then delete the sale
      const { error: saleError } = await supabase
        .from('sales')
        .delete()
        .eq('id', deletingSale.id);

      if (saleError) throw saleError;

      // Reload dashboard data
      await loadDashboardData();

      setShowDeleteSaleDialog(false);
      setDeletingSale(null);
    } catch (error) {
      console.error('Error deleting sale:', error);
      alert('Failed to delete sale. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-red-950 to-gray-900">
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
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <img src="/logo.png" alt="Dragon Auto Shop Logo" className="w-12 h-12 drop-shadow-[0_0_25px_rgba(218,165,32,0.8)]" />
                  <div className="absolute inset-0 bg-yellow-500 opacity-40 blur-2xl"></div>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-red-500">DRAGON AUTO SHOP</h1>
                  <p className="text-xs text-gray-400">Hydra Roleplay</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <p className="text-sm text-gray-400">Mechanic</p>
                  <p className="font-semibold text-white">{employee?.character_name}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-gray-400 transition-colors hover:text-red-500"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-8 mx-auto max-w-7xl sm:px-6 lg:px-8">
          {/* Announcement Display */}
          {announcement && (
            <div className="relative p-6 mb-8 border-2 rounded-lg bg-red-950/40 backdrop-blur-md border-red-600/70">
              <div className="flex items-start pr-8 space-x-4">
                <div className="flex-shrink-0">
                  <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="mb-2 text-lg font-bold text-red-500">📢 Announcement</h3>
                  <p className="mb-2 text-sm leading-relaxed text-red-200">{announcement.message}</p>
                  <p className="text-xs text-red-300">
                    Expires: {new Date(announcement.expires_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Verification Alert */}
          {!hideVerificationAlert && allSales.filter(sale => !sale.is_verified && !sale.is_fake).length > 0 && (
            <div className="relative p-6 mb-8 border-2 rounded-lg bg-red-950/40 backdrop-blur-md border-red-600/70">
              <button
                onClick={handleHideVerificationAlert}
                className="absolute p-1 text-red-400 transition-colors rounded top-4 right-4 hover:text-red-200 hover:bg-red-600/20"
                title="Hide this alert"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="flex items-start pr-8 space-x-4">
                <div className="flex-shrink-0">
                  <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="mb-2 text-lg font-bold text-red-500">⚠️ Verification Required</h3>
                  <p className="mb-2 text-sm leading-relaxed text-red-200">
                    You have <span className="font-bold text-red-400">{allSales.filter(sale => !sale.is_verified && !sale.is_fake).length}</span> {allSales.filter(sale => !sale.is_verified && !sale.is_fake).length === 1 ? 'bill' : 'bills'} pending verification.
                  </p>
                  <p className="text-sm leading-relaxed text-red-300">
                    <span className="font-semibold">Important Notice:</span> Failure to verify your sales may result in bills being marked as fraudulent, which could negatively impact your performance evaluations, promotional opportunities, and salary adjustments.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 mb-8 md:grid-cols-3">
            <div className="p-6 transition-all transform border rounded-lg bg-black/60 backdrop-blur-md border-red-600/30 hover:scale-105">
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-1 text-sm text-gray-400">Customers Handled</p>
                  <p className="text-3xl font-bold text-red-500">{customerCount}</p>
                </div>
                <div className="p-3 rounded-lg bg-red-500/20">
                  <Users className="w-8 h-8 text-red-500" />
                </div>
              </div>
            </div>

            <div className="p-6 transition-all transform border rounded-lg bg-black/60 backdrop-blur-md border-red-600/30 hover:scale-105">
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-1 text-sm text-gray-400">Total Sales</p>
                  <p className="text-3xl font-bold text-red-500">{formatCurrency(totalSales)}</p>
                </div>
                <div className="p-3 rounded-lg bg-red-500/20">
                  <DollarSign className="w-8 h-8 text-red-500" />
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowAllTransactions(!showAllTransactions)}
              className="w-full p-6 text-left transition-all transform border rounded-lg cursor-pointer bg-black/60 backdrop-blur-md border-red-600/30 hover:scale-105 hover:border-red-600/50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="mb-1 text-sm text-gray-400">Transactions</p>
                  <p className="text-3xl font-bold text-red-500">{customerCount}</p>
                  <p className="mt-1 text-xs text-red-400">{showAllTransactions ? 'Hide All' : 'View All'}</p>
                </div>
                <div className="p-3 rounded-lg bg-red-500/20">
                  <Receipt className="w-8 h-8 text-red-500" />
                </div>
              </div>
            </button>
          </div>

          <div className="p-6 mb-8 border rounded-lg bg-black/60 backdrop-blur-md border-red-600/30">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-red-500">
                  {showAllTransactions ? 'All Transactions' : 'Recent Transactions'}
                </h2>
                <p className="mt-1 text-xs text-gray-400">
                  {showAllTransactions ? `Showing all ${allSales.length} transactions` : `Showing ${recentSales.length} most recent transactions`}
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleQuickBill}
                  className="flex items-center px-6 py-2 space-x-2 font-bold text-white transition-all transform rounded bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 hover:scale-105"
                >
                  <Zap className="w-5 h-5" />
                  <span>REPAIR BILL ($500)</span>
                </button>
                <button
                  onClick={onNewSale}
                  className="flex items-center px-6 py-2 space-x-2 font-bold text-white transition-all transform rounded bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:scale-105"
                >
                  <Plus className="w-5 h-5" />
                  <span>NEW SALE</span>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-8 text-center text-gray-400">Loading...</div>
            ) : (showAllTransactions ? allSales : recentSales).length === 0 ? (
              <div className="py-8 text-center text-gray-400">No sales yet. Create your first sale!</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-red-600/30">
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-left text-red-400 uppercase">Date</th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-left text-red-400 uppercase">Customer</th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-left text-red-400 uppercase">Vehicle</th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-center text-red-400 uppercase">Items</th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-right text-red-400 uppercase">Total</th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-center text-red-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-600/30">
                    {(showAllTransactions ? allSales : recentSales).map((sale) => (
                      <tr key={sale.id} className="transition-colors hover:bg-red-600/10">
                        <td className={`px-4 py-4 text-sm ${sale.is_fake ? 'text-yellow-400' : 'text-gray-400'}`}>{formatDate(sale.created_at)}</td>
                        <td className={`px-4 py-4 text-sm font-medium ${sale.is_fake ? 'text-yellow-400' : 'text-white'}`}>{sale.customer_name}</td>
                        <td className={`px-4 py-4 text-sm ${sale.is_fake ? 'text-yellow-400' : 'text-gray-400'}`}>{sale.vehicle_plate}</td>
                        <td className={`px-4 py-4 text-sm text-center ${sale.is_fake ? 'text-yellow-400' : 'text-gray-400'}`}>
                          {sale.item_count || 0}
                        </td>
                        <td className={`px-4 py-4 text-sm font-bold text-right ${sale.is_fake ? 'text-yellow-500' : 'text-red-500'}`}>
                          {formatCurrency(Number(sale.total_amount))}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center space-x-2">
                            {!sale.is_verified && (
                              <button
                                onClick={() => setVerifyingSale(sale)}
                                className="p-2 text-purple-400 transition-colors rounded bg-purple-600/20 hover:bg-purple-600/40"
                                title="Verify Bill"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleViewSale(sale)}
                              className="p-2 text-blue-400 transition-colors rounded bg-blue-600/20 hover:bg-blue-600/40"
                              title="View/Edit Bill"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleSavePDF(sale)}
                              className="p-2 text-green-400 transition-colors rounded bg-green-600/20 hover:bg-green-600/40"
                              title="Save PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteSale(sale)}
                              className="p-2 text-red-400 transition-colors rounded bg-red-600/20 hover:bg-red-600/40"
                              title="Delete Sale"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* View/Edit Bill Modal */}
      {viewingSale && editMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-gray-900 via-red-950 to-gray-900 border-2 border-red-600/50 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 p-6 border-b bg-black/80 backdrop-blur-md border-red-600/30">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-red-500">VIEW/EDIT BILL</h2>
                  <p className="mt-1 text-sm text-gray-400">Invoice #{viewingSale.id.substring(0, 8).toUpperCase()}</p>
                  {viewingSale.is_fake && (
                    <p className="mt-1 text-sm font-semibold text-yellow-400">⚠️ MARKED AS FAKE SALE</p>
                  )}
                </div>
                <button
                  onClick={handleCloseView}
                  className="text-2xl font-bold text-gray-400 transition-colors hover:text-red-500"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Customer Info */}
              <div className="p-4 mb-6 border rounded-lg bg-black/40 border-red-600/30">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-400">Customer Name</p>
                    <p className="font-semibold text-white">{viewingSale.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Vehicle Plate</p>
                    <p className="font-semibold text-white">{viewingSale.vehicle_plate}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Date</p>
                    <p className="font-semibold text-white">{formatDate(viewingSale.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Mechanic</p>
                    <p className="font-semibold text-white">{employee?.character_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Total</p>
                    <p className="font-semibold text-red-500">{formatCurrency(viewingSale.total_amount || 0)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Status</p>
                    <p className={`font-semibold ${
                      viewingSale.is_fake 
                        ? 'text-yellow-400' 
                        : viewingSale.is_verified 
                          ? 'text-green-400' 
                          : 'text-orange-400'
                    }`}>
                      {viewingSale.is_fake 
                        ? 'Marked as Fake' 
                        : viewingSale.is_verified 
                          ? 'Verified' 
                          : 'Needs Verification'
                      }
                    </p>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="mb-6 overflow-hidden border rounded-lg bg-black/40 border-red-600/30">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-red-600/20 border-red-600/30">
                      <th className="px-4 py-3 font-semibold text-left text-red-400">ITEM</th>
                      <th className="px-4 py-3 font-semibold text-left text-red-400">CATEGORY</th>
                      <th className="px-4 py-3 font-semibold text-right text-red-400">PRICE</th>
                      <th className="px-4 py-3 font-semibold text-center text-red-400">ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {saleItems.map((item) => (
                      <tr key={item.id} className="transition-colors border-b border-red-600/10 hover:bg-red-900/10">
                        <td className="px-4 py-3 text-white">{item.item_name}</td>
                        <td className="px-4 py-3 text-gray-300">{item.item_category}</td>
                        <td className="px-4 py-3 font-semibold text-right text-red-500">
                          {formatCurrency(Number(item.price))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="font-bold text-red-400 transition-colors hover:text-red-600"
                          >
                            DELETE
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="p-4 border rounded-lg bg-black/40 border-red-600/30">
                <div className="space-y-2">
                  <div className="flex justify-between text-gray-400">
                    <span>Subtotal</span>
                    <span>{formatCurrency(viewingSale.subtotal || 0)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Discount ({viewingSale.discount_percentage || 0}%)</span>
                    <span>-{formatCurrency(viewingSale.discount_amount || 0)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Tax (14%)</span>
                    <span>{formatCurrency(viewingSale.tax_amount || 0)}</span>
                  </div>
                  <div className="pt-2 border-t border-red-600/30">
                    <div className="flex justify-between text-xl font-bold text-red-500">
                      <span>TOTAL</span>
                      <span>{formatCurrency(viewingSale.total_amount || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end mt-6 space-x-4">
                <button
                  onClick={handleCloseView}
                  className="px-6 py-3 font-bold text-white transition-colors bg-gray-600 rounded hover:bg-gray-700"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleUpdateBill}
                  className="px-6 py-3 font-bold text-white transition-all transform rounded bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 hover:scale-105"
                >
                  SAVE CHANGES
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Popup */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-8 border-2 rounded-lg shadow-2xl bg-gradient-to-br from-gray-900 via-red-950 to-gray-900 border-red-600/50">
            <div className="mb-6 text-center">
              <div className="flex justify-center mb-4">
                <div className="p-4 rounded-full bg-red-600/20">
                  <svg className="w-12 h-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <h2 className="mb-2 text-2xl font-bold text-red-500">Delete Item</h2>
              <p className="text-sm text-gray-400">
                Are you sure you want to delete this item?
              </p>
              <p className="mt-2 text-xs font-semibold text-red-400">
                This action cannot be reverted!
              </p>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setItemToDelete(null);
                }}
                className="flex-1 px-6 py-3 font-bold text-white transition-all bg-gray-600 rounded hover:bg-gray-700"
              >
                CANCEL
              </button>
              <button
                onClick={confirmDeleteItem}
                className="flex-1 px-6 py-3 font-bold text-white transition-all transform rounded shadow-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:scale-105"
              >
                DELETE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Sale Confirmation Popup */}
      {showDeleteSaleDialog && deletingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-8 border-2 rounded-lg shadow-2xl bg-gradient-to-br from-gray-900 via-red-950 to-gray-900 border-red-600/50">
            <div className="mb-6 text-center">
              <div className="flex justify-center mb-4">
                <div className="p-4 rounded-full bg-red-600/20">
                  <svg className="w-12 h-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <h2 className="mb-2 text-2xl font-bold text-red-500">Delete Sale</h2>
              <p className="text-sm text-gray-400">
                Are you sure you want to delete this sale for <span className="font-semibold text-white">{deletingSale.customer_name}</span>?
              </p>
              <p className="mt-2 text-xs font-semibold text-red-400">
                This will permanently delete the sale and all its items. This action cannot be reverted!
              </p>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setShowDeleteSaleDialog(false);
                  setDeletingSale(null);
                }}
                className="flex-1 px-6 py-3 font-bold text-white transition-all bg-gray-600 rounded hover:bg-gray-700"
              >
                CANCEL
              </button>
              <button
                onClick={confirmDeleteSale}
                disabled={isDeleting}
                className="flex-1 px-6 py-3 font-bold text-white transition-all transform rounded shadow-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isDeleting ? 'DELETING...' : 'DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verify Bill Modal */}
      {verifyingSale && (
        <VerifyBillModal
          saleId={verifyingSale.id}
          onClose={() => setVerifyingSale(null)}
          onSuccess={() => {
            addToast('Bill verified successfully!', 'success');
            addToast('Verification images uploaded to Discord!', 'success', 'discord');
            loadDashboardData();
          }}
        />
      )}

      {/* Save Changes Confirmation Popup */}
      {showSaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-8 border-2 rounded-lg shadow-2xl bg-gradient-to-br from-gray-900 via-red-950 to-gray-900 border-red-600/50">
            <div className="mb-6 text-center">
              <div className="flex justify-center mb-4">
                <div className="p-4 rounded-full bg-green-600/20">
                  <svg className="w-12 h-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <h2 className="mb-2 text-2xl font-bold text-green-500">Save Changes</h2>
              <p className="text-sm text-gray-400">
                Are you sure you want to save these changes?
              </p>
              <p className="mt-2 text-xs text-gray-500">
                The bill will be updated in the database.
              </p>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={() => setShowSaveConfirm(false)}
                className="flex-1 px-6 py-3 font-bold text-white transition-all bg-gray-600 rounded hover:bg-gray-700"
              >
                CANCEL
              </button>
              <button
                onClick={confirmUpdateBill}
                disabled={isSaving}
                className="flex-1 px-6 py-3 font-bold text-white transition-all transform rounded shadow-lg bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isSaving ? 'SAVING...' : 'CONFIRM'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 py-3 border-t bg-black/80 backdrop-blur-md border-red-600/30">
        <div className="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
          <p className="text-sm text-center text-gray-400">
            <span className="inline-flex items-center space-x-2">
              <span>Crafted with</span>
              <span className="text-red-500 animate-pulse">❤️</span>
              <span>by</span>
              <span className="font-bold text-red-500">Vedant</span>
              <span className="text-gray-500">{`{`}</span>
              <span className="font-semibold text-red-400">NOOB GAMER</span>
              <span className="text-gray-500">{`}`}</span>
              <span className="text-gray-500">•</span>
              <span>Made for</span>
              <span className="font-bold text-red-500">Hydra Roleplay</span>
              <img src="/logo.png" alt="Dragon" className="inline-block w-5 h-5" />
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}