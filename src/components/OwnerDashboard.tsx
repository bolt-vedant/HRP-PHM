import { useState, useEffect } from 'react';
import { supabase, Employee, Sale, SaleItem, Announcement } from '../lib/supabase';
import { getOwner, clearOwner, getEmployee } from '../lib/auth';
import { Users, DollarSign, Receipt, Plus, LogOut, Eye, Ban, Check, X, Download, Trash2, AlertTriangle, Zap, Megaphone, Edit2 } from 'lucide-react';
import { sendDiscordNotification, editDiscordMessage, deleteDiscordMessage } from '../lib/discord';
import Toast from './Toast';

interface OwnerDashboardProps {
  onNewSale: () => void;
  onLogout: () => void;
}

interface EmployeeStats {
  employee: Employee;
  todaySales: number;
  weeklySales: number;
  totalSales: number;
  salesCount: number;
}

interface SaleWithItems extends Sale {
  item_count?: number;
  is_fake?: boolean;
}

export default function OwnerDashboard({ onNewSale, onLogout }: OwnerDashboardProps) {
  const [employeeStats, setEmployeeStats] = useState<EmployeeStats[]>([]);
  const [filteredStats, setFilteredStats] = useState<EmployeeStats[]>([]);
  const [employeeFilter, setEmployeeFilter] = useState<'all' | 'blocked'>('all');
  const [ownerSales, setOwnerSales] = useState<SaleWithItems[]>([]);
  const [recentOwnerSales, setRecentOwnerSales] = useState<SaleWithItems[]>([]);
  const [showAllOwnerSales, setShowAllOwnerSales] = useState(false);
  const [loading, setLoading] = useState(true);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [employeeSales, setEmployeeSales] = useState<Sale[]>([]);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [blockingEmployee, setBlockingEmployee] = useState<Employee | null>(null);
  const [showUnblockDialog, setShowUnblockDialog] = useState(false);
  const [unblockingEmployee, setUnblockingEmployee] = useState<Employee | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState(1);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
  const [viewingSaleDetails, setViewingSaleDetails] = useState<Sale | null>(null);
  const [viewingSaleItems, setViewingSaleItems] = useState<SaleItem[]>([]);
  const [deletingSale, setDeletingSale] = useState<Sale | null>(null);
  const [showDeleteSaleDialog, setShowDeleteSaleDialog] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [showDeleteItemConfirm, setShowDeleteItemConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isMarkingFake, setIsMarkingFake] = useState(false);
  const [markingFakeSale, setMarkingFakeSale] = useState<Sale | null>(null);
  const [showMarkFakeDialog, setShowMarkFakeDialog] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; type: 'success' | 'error'; icon?: 'discord' | 'default' }>>([]);
  const [showEmployeeTable, setShowEmployeeTable] = useState(false);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [showAnnouncementDialog, setShowAnnouncementDialog] = useState(false);
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [announcementExpiry, setAnnouncementExpiry] = useState(24);
  const [editingAnnouncement, setEditingAnnouncement] = useState(false);
  const owner = getOwner();
  const ownerAsEmployee = getEmployee();

  const addToast = (message: string, type: 'success' | 'error', icon: 'discord' | 'default' = 'default') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type, icon }]);
  };

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  useEffect(() => {
    loadEmployeeStats();
    loadOwnerSales();
    loadAnnouncement();

    // Set up real-time subscription for sales updates to refresh employee stats
    const salesSubscription = supabase
      .channel('owner-sales-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales'
        },
        (payload) => {
          console.log('Sales change detected in owner dashboard:', payload);
          loadEmployeeStats();
          loadOwnerSales();
        }
      )
      .subscribe();

    const announcementSubscription = supabase
      .channel('announcements-changes')
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
      salesSubscription.unsubscribe();
      announcementSubscription.unsubscribe();
    };
  }, []);

  const loadOwnerSales = async () => {
    if (!owner) {
      console.log('No owner found in loadOwnerSales');
      return;
    }

    console.log('Loading sales for owner:', owner.character_name, owner.discord_id);

    try {
      // Get owner's employee record
      const { data: ownerEmployeeRecord, error: empError } = await supabase
        .from('employees')
        .select('*')
        .eq('discord_id', owner.discord_id)
        .maybeSingle();

      if (empError) {
        console.error('Error fetching owner employee record:', empError);
        return;
      }

      if (!ownerEmployeeRecord) {
        console.log('No employee record found for owner. Owner needs to log out and log back in to create employee record.');
        return;
      }

      console.log('Found owner employee record:', ownerEmployeeRecord.id, ownerEmployeeRecord.character_name);

      // Fetch sales created by owner only
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .eq('employee_id', ownerEmployeeRecord.id)
        .order('created_at', { ascending: false });

      if (salesError) {
        console.error('Error fetching sales:', salesError);
        throw salesError;
      }

      console.log('Found sales for owner:', sales?.length || 0);

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

        console.log('Setting owner sales:', salesWithCounts.length);
        setOwnerSales(salesWithCounts);
        setRecentOwnerSales(salesWithCounts.slice(0, 5));
      }
    } catch (error) {
      console.error('Error loading owner sales:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEmployeeStats = async () => {
    if (!owner) return;

    try {
      // Fetch all employees EXCEPT the owner's employee record
      const { data: employees, error: employeesError } = await supabase
        .from('employees')
        .select('*')
        .neq('discord_id', owner.discord_id) // Exclude owner from employee list
        .order('created_at', { ascending: false });

      if (employeesError) throw employeesError;

      if (employees) {
        // Calculate stats for each employee
        const stats = await Promise.all(
          employees.map(async (employee) => {
            // Get all sales for this employee
            const { data: sales, error: salesError } = await supabase
              .from('sales')
              .select('*')
              .eq('employee_id', employee.id);

            if (salesError) throw salesError;

            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - 7);

            // Filter out fake sales
            const realSales = sales?.filter(sale => !sale.is_fake) || [];

            const todaySales = realSales
              .filter(sale => new Date(sale.created_at) >= todayStart)
              .reduce((sum, sale) => sum + Number(sale.total_amount), 0);

            const weeklySales = realSales
              .filter(sale => new Date(sale.created_at) >= weekStart)
              .reduce((sum, sale) => sum + Number(sale.total_amount), 0);

            const totalSales = realSales
              .reduce((sum, sale) => sum + Number(sale.total_amount), 0);

            return {
              employee,
              todaySales,
              weeklySales,
              totalSales,
              salesCount: sales?.length || 0
            };
          })
        );

        setEmployeeStats(stats);
        setFilteredStats(stats);
      }
    } catch (error) {
      console.error('Error loading employee stats:', error);
    }
  };

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

  const handleCreateAnnouncement = async () => {
    if (!owner || !announcementMessage.trim()) return;

    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + announcementExpiry);

      const { error } = await supabase
        .from('announcements')
        .insert({
          message: announcementMessage.trim(),
          expires_at: expiresAt.toISOString(),
          created_by: owner.id
        });

      if (error) throw error;

      addToast('Announcement created successfully!', 'success');
      setShowAnnouncementDialog(false);
      setAnnouncementMessage('');
      setAnnouncementExpiry(24);
      loadAnnouncement();
    } catch (error) {
      console.error('Error creating announcement:', error);
      addToast('Failed to create announcement', 'error');
    }
  };

  const handleUpdateAnnouncement = async () => {
    if (!owner || !announcementMessage.trim() || !announcement) return;

    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + announcementExpiry);

      const { error } = await supabase
        .from('announcements')
        .update({
          message: announcementMessage.trim(),
          expires_at: expiresAt.toISOString()
        })
        .eq('id', announcement.id);

      if (error) throw error;

      addToast('Announcement updated successfully!', 'success');
      setShowAnnouncementDialog(false);
      setAnnouncementMessage('');
      setAnnouncementExpiry(24);
      setEditingAnnouncement(false);
      loadAnnouncement();
    } catch (error) {
      console.error('Error updating announcement:', error);
      addToast('Failed to update announcement', 'error');
    }
  };

  const handleDeleteAnnouncement = async () => {
    if (!announcement) return;

    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', announcement.id);

      if (error) throw error;

      addToast('Announcement deleted successfully!', 'success');
      loadAnnouncement();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      addToast('Failed to delete announcement', 'error');
    }
  };

  const openAnnouncementDialog = (edit: boolean = false) => {
    if (edit && announcement) {
      setAnnouncementMessage(announcement.message);
      const hoursLeft = Math.ceil((new Date(announcement.expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60));
      setAnnouncementExpiry(Math.max(1, hoursLeft));
      setEditingAnnouncement(true);
    } else {
      setAnnouncementMessage('');
      setAnnouncementExpiry(24);
      setEditingAnnouncement(false);
    }
    setShowAnnouncementDialog(true);
  };

  useEffect(() => {
    if (employeeFilter === 'all') {
      setFilteredStats(employeeStats);
    } else if (employeeFilter === 'blocked') {
      setFilteredStats(employeeStats.filter(stat => stat.employee.is_blocked));
    }
  }, [employeeFilter, employeeStats]);

  const handleLogout = () => {
    clearOwner();
    onLogout();
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const handleOwnerQuickBill = async () => {
    if (!ownerAsEmployee) return;

    try {
      const customerName = 'Vehicle Repair';
      const vehiclePlate = 'REPAIR';
      const repairPrice = 500;
      const taxAmount = repairPrice * 0.14;
      const total = repairPrice + taxAmount;

      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({
          employee_id: ownerAsEmployee.id,
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
        mechanicName: ownerAsEmployee.character_name,
        mechanicDiscordId: ownerAsEmployee.discord_id,
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
      }, ownerAsEmployee.id, true);

      if (discordMessageId) {
        await supabase
          .from('sales')
          .update({ discord_message_id: discordMessageId })
          .eq('id', sale.id);
        addToast('Bill uploaded to Discord successfully!', 'success', 'discord');
      } else {
        addToast('Failed to upload bill to Discord', 'error', 'discord');
      }

      loadOwnerSales();
    } catch (error) {
      console.error('Error creating repair bill:', error);
      addToast('Failed to create repair bill', 'error');
    }
  };

  const handleViewSales = async (employee: Employee) => {
    try {
      const { data: sales, error } = await supabase
        .from('sales')
        .select('*')
        .eq('employee_id', employee.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Add item counts
      const salesWithCounts = await Promise.all(
        (sales || []).map(async (sale) => {
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

      setEmployeeSales(salesWithCounts);
      setViewingEmployee(employee);
    } catch (error) {
      console.error('Error loading employee sales:', error);
    }
  };

  const handleBlockEmployee = (employee: Employee) => {
    setBlockingEmployee(employee);
    setBlockReason('');
    setShowBlockDialog(true);
  };

  const confirmBlockEmployee = async () => {
    if (!blockingEmployee || !blockReason.trim()) {
      alert('Please provide a reason for blocking this employee.');
      return;
    }

    try {
      const { error } = await supabase
        .from('employees')
        .update({
          is_blocked: true,
          block_reason: blockReason,
          blocked_at: new Date().toISOString()
        })
        .eq('id', blockingEmployee.id);

      if (error) throw error;

      // Reload stats
      await loadEmployeeStats();
      setShowBlockDialog(false);
      setBlockingEmployee(null);
      setBlockReason('');
    } catch (error) {
      console.error('Error blocking employee:', error);
      alert('Failed to block employee. Please try again.');
    }
  };

  const handleUnblockEmployee = (employee: Employee) => {
    setUnblockingEmployee(employee);
    setShowUnblockDialog(true);
  };

  const confirmUnblockEmployee = async () => {
    if (!unblockingEmployee) return;

    try {
      const { error } = await supabase
        .from('employees')
        .update({
          is_blocked: false,
          block_reason: null,
          blocked_at: null
        })
        .eq('id', unblockingEmployee.id);

      if (error) throw error;

      // Reload stats
      await loadEmployeeStats();
      setShowUnblockDialog(false);
      setUnblockingEmployee(null);
    } catch (error) {
      console.error('Error unblocking employee:', error);
      alert('Failed to unblock employee. Please try again.');
    }
  };

  const handleDeleteEmployee = (employee: Employee) => {
    setDeletingEmployee(employee);
    setDeleteConfirmStep(1);
    setShowDeleteDialog(true);
  };

  const confirmDeleteEmployee = async () => {
    if (!deletingEmployee) return;

    try {
      // First, get all sales for this employee
      const { data: sales, error: salesFetchError } = await supabase
        .from('sales')
        .select('id')
        .eq('employee_id', deletingEmployee.id);

      if (salesFetchError) throw salesFetchError;

      // Delete all sale_items for these sales
      if (sales && sales.length > 0) {
        const saleIds = sales.map(s => s.id);
        const { error: itemsError } = await supabase
          .from('sale_items')
          .delete()
          .in('sale_id', saleIds);

        if (itemsError) throw itemsError;

        // Delete all sales
        const { error: salesError } = await supabase
          .from('sales')
          .delete()
          .eq('employee_id', deletingEmployee.id);

        if (salesError) throw salesError;
      }

      // Finally, delete the employee
      const { error: employeeError } = await supabase
        .from('employees')
        .delete()
        .eq('id', deletingEmployee.id);

      if (employeeError) throw employeeError;

      // Reload stats
      await loadEmployeeStats();
      setShowDeleteDialog(false);
      setDeletingEmployee(null);
      setDeleteConfirmStep(1);
    } catch (error) {
      console.error('Error deleting employee:', error);
      alert('Failed to delete employee. Please try again.');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleMarkAsFake = (sale: Sale) => {
    setMarkingFakeSale(sale);
    setShowMarkFakeDialog(true);
  };

  const confirmMarkAsFake = async () => {
    if (!markingFakeSale) return;

    setIsMarkingFake(true);
    try {
      const { error } = await supabase
        .from('sales')
        .update({ is_fake: !markingFakeSale.is_fake })
        .eq('id', markingFakeSale.id);

      if (error) throw error;

      // Edit Discord message if exists
      if (markingFakeSale.discord_message_id) {
        const { data: items } = await supabase
          .from('sale_items')
          .select('*')
          .eq('sale_id', markingFakeSale.id);

        const { data: employee } = await supabase
          .from('employees')
          .select('*')
          .eq('id', markingFakeSale.employee_id)
          .single();

        if (employee) {
          const billDate = new Date(markingFakeSale.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          const discordSuccess = await editDiscordMessage(
            markingFakeSale.discord_message_id,
            {
              saleId: markingFakeSale.id,
              date: billDate,
              mechanicName: employee.character_name,
              mechanicDiscordId: employee.discord_id,
              customerName: markingFakeSale.customer_name,
              plateNumber: markingFakeSale.vehicle_plate,
              totalItems: items?.length || 0,
              amount: markingFakeSale.total_amount,
              items: items?.map((item: any) => ({
                name: item.item_name,
                category: item.item_category,
                type: item.item_type,
                quantity: item.quantity,
                price: Number(item.price)
              })) || []
            },
            employee.id,
            !markingFakeSale.is_fake
          );

          if (discordSuccess) {
            addToast('Bill status updated on Discord!', 'success', 'discord');
          } else {
            addToast('Failed to update bill on Discord', 'error', 'discord');
          }
        }
      }

      // Reload employee sales
      if (viewingEmployee) {
        await handleViewSales(viewingEmployee);
      }

      // Reload employee stats to update totals
      await loadEmployeeStats();

      setShowMarkFakeDialog(false);
      setMarkingFakeSale(null);
    } catch (error) {
      console.error('Error marking sale as fake:', error);
      alert('Failed to update sale. Please try again.');
    } finally {
      setIsMarkingFake(false);
    }
  };

  const handleViewSaleBreakdown = async (sale: Sale) => {
    try {
      const { data: items, error } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', sale.id);

      if (error) throw error;

      setViewingSaleItems(items || []);
      setViewingSaleDetails(sale);
    } catch (error) {
      console.error('Error loading sale items:', error);
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

      // Reload employee sales if viewing employee
      if (viewingEmployee) {
        await handleViewSales(viewingEmployee);
      }

      // Reload employee stats
      await loadEmployeeStats();

      setShowDeleteSaleDialog(false);
      setDeletingSale(null);
    } catch (error) {
      console.error('Error deleting sale:', error);
      alert('Failed to delete sale. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteOwnerSale = (sale: Sale) => {
    setDeletingSale(sale);
    setShowDeleteSaleDialog(true);
  };

  const confirmDeleteOwnerSale = async () => {
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

      // Reload owner sales
      await loadOwnerSales();

      setShowDeleteSaleDialog(false);
      setDeletingSale(null);
    } catch (error) {
      console.error('Error deleting sale:', error);
      alert('Failed to delete sale. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleViewOwnerSale = async (sale: Sale) => {
    try {
      const { data: items, error } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', sale.id);

      if (error) throw error;

      setViewingSaleItems(items || []);
      setViewingSaleDetails(sale);
    } catch (error) {
      console.error('Error loading sale items:', error);
    }
  };

  const handleCloseOwnerSaleView = () => {
    setViewingSaleDetails(null);
    setViewingSaleItems([]);
  };

  const handleDeleteOwnerSaleItem = (itemId: string) => {
    setItemToDelete(itemId);
    setShowDeleteItemConfirm(true);
  };

  const confirmDeleteOwnerSaleItem = async () => {
    if (!itemToDelete || !viewingSaleDetails) return;

    try {
      const { error } = await supabase
        .from('sale_items')
        .delete()
        .eq('id', itemToDelete);

      if (error) throw error;

      // Update local state
      const updatedItems = viewingSaleItems.filter(item => item.id !== itemToDelete);
      setViewingSaleItems(updatedItems);

      // Recalculate sale totals with remaining items
      const newSubtotal = updatedItems.reduce((sum, item) => sum + Number(item.subtotal || item.price * item.quantity), 0);
      const discountPercentage = viewingSaleDetails.discount_percentage || 0;
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
        .eq('id', viewingSaleDetails.id);

      if (saleError) throw saleError;

      // Update viewingSaleDetails state to reflect new totals in the modal
      setViewingSaleDetails({
        ...viewingSaleDetails,
        subtotal: newSubtotal,
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        total_amount: newTotal
      });

      // Reload owner sales
      await loadOwnerSales();

      setShowDeleteItemConfirm(false);
      setItemToDelete(null);
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item. Please try again.');
      setShowDeleteItemConfirm(false);
      setItemToDelete(null);
    }
  };

  const handleUpdateOwnerBill = () => {
    setShowSaveConfirm(true);
  };

  const confirmUpdateOwnerBill = async () => {
    if (!viewingSaleDetails) return;

    setIsSaving(true);
    try {
      // Calculate new subtotal from current items
      const newSubtotal = viewingSaleItems.reduce((sum, item) => sum + Number(item.subtotal || item.price * item.quantity), 0);
      
      // Get discount percentage from the original sale
      const discountPercentage = viewingSaleDetails.discount_percentage || 0;
      
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
        .eq('id', viewingSaleDetails.id);

      if (saleError) throw saleError;

      // Reload owner sales
      await loadOwnerSales();

      // Then close dialogs and edit mode
      setShowSaveConfirm(false);
      setViewingSaleDetails(null);
      setViewingSaleItems([]);
    } catch (error) {
      console.error('Error updating bill:', error);
      alert('Failed to update bill. Please try again.');
      setShowSaveConfirm(false);
    } finally {
      setIsSaving(false);
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
                <p>${owner?.character_name || 'N/A'}</p>
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
              <p class="mechanic">Mechanic: ${owner?.character_name || 'N/A'}</p>
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

  const totalRevenue = employeeStats.reduce((sum, stat) => sum + stat.totalSales, 0) + ownerSales.filter(sale => !sale.is_fake).reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  const totalEmployees = employeeStats.length;
  const blockedEmployees = employeeStats.filter(stat => stat.employee.is_blocked).length;
  const totalTransactions = employeeStats.reduce((sum, stat) => sum + stat.salesCount, 0);

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
        {/* Header */}
        <div className="border-b border-red-600/30 bg-black/60 backdrop-blur-md">
          <div className="px-4 py-4 mx-auto max-w-7xl sm:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <img src="/logo.png" alt="Dragon Auto Shop Logo" className="w-12 h-12 drop-shadow-[0_0_25px_rgba(218,165,32,0.8)]" />
                  <div className="absolute inset-0 bg-yellow-500 opacity-40 blur-2xl"></div>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-red-500">DRAGON AUTO SHOP - OWNER PANEL</h1>
                  <p className="text-xs text-gray-400">Hydra Roleplay</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <p className="text-sm text-gray-400">Owner</p>
                  <p className="font-semibold text-white">{owner?.character_name}</p>
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
                  <Megaphone className="w-8 h-8 text-red-500" />
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

          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-6 mb-8 md:grid-cols-4">
            <button
              onClick={() => setEmployeeFilter('all')}
              className={`p-6 transition-all transform border rounded-lg bg-black/60 backdrop-blur-md text-left ${
                employeeFilter === 'all' ? 'border-red-500 ring-2 ring-red-500' : 'border-red-600/30 hover:scale-105'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Total Employees</p>
                  <p className="mt-2 text-3xl font-bold text-white">{totalEmployees}</p>
                </div>
                <Users className="w-12 h-12 text-red-500" />
              </div>
            </button>

            <button
              onClick={() => setEmployeeFilter('blocked')}
              className={`p-6 transition-all transform border rounded-lg bg-black/60 backdrop-blur-md text-left ${
                employeeFilter === 'blocked' ? 'border-red-500 ring-2 ring-red-500' : 'border-red-600/30 hover:scale-105'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Blocked Employees</p>
                  <p className="mt-2 text-3xl font-bold text-white">{blockedEmployees}</p>
                </div>
                <Ban className="w-12 h-12 text-red-500" />
              </div>
            </button>

            <div className="p-6 transition-all transform border rounded-lg bg-black/60 backdrop-blur-md border-red-600/30 hover:scale-105">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Total Revenue</p>
                  <p className="mt-2 text-3xl font-bold text-white">{formatCurrency(totalRevenue)}</p>
                </div>
                <DollarSign className="w-12 h-12 text-red-500" />
              </div>
            </div>

            <div className="p-6 transition-all transform border rounded-lg bg-black/60 backdrop-blur-md border-red-600/30 hover:scale-105">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Total Transactions</p>
                  <p className="mt-2 text-3xl font-bold text-white">{totalTransactions}</p>
                </div>
                <Receipt className="w-12 h-12 text-red-500" />
              </div>
            </div>
          </div>

          {/* Employee Management Table */}
          <div className={`border rounded-lg bg-black/60 backdrop-blur-md border-red-600/30 ${showEmployeeTable ? 'p-6 mb-8' : 'p-6 mb-6'}`}>
            <div className={`flex items-center justify-between ${showEmployeeTable ? 'mb-6' : 'mb-0'}`}>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {employeeFilter === 'all' ? 'Employee Management' : 'Blocked Employees'}
                </h2>
                <p className="text-sm text-gray-400">
                  {employeeFilter === 'all' 
                    ? 'Manage and monitor your employees' 
                    : `Showing ${blockedEmployees} blocked employee${blockedEmployees !== 1 ? 's' : ''}`
                  }
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => openAnnouncementDialog(false)}
                  className="flex items-center px-4 py-2 space-x-2 text-sm font-bold text-white transition-all transform border rounded bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:scale-105"
                >
                  <Megaphone className="w-4 h-4" />
                  <span>Set Announcement</span>
                </button>
                {announcement && (
                  <>
                    <button
                      onClick={() => openAnnouncementDialog(true)}
                      className="flex items-center px-4 py-2 space-x-2 text-sm font-bold text-white transition-all transform border rounded bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 hover:scale-105"
                    >
                      <Edit2 className="w-4 h-4" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={handleDeleteAnnouncement}
                      className="flex items-center px-4 py-2 space-x-2 text-sm font-bold text-white transition-all transform border rounded bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:scale-105"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowEmployeeTable(!showEmployeeTable)}
                  className="px-4 py-2 text-sm font-bold text-white transition-all transform border rounded bg-black/60 border-red-600/30 hover:bg-red-600/20 hover:scale-105"
                >
                  {showEmployeeTable ? 'Hide Employees' : 'Show Employees'}
                </button>
              </div>
            </div>

            {showEmployeeTable && (
              loading ? (
                <div className="py-8 text-center text-gray-400">Loading...</div>
              ) : filteredStats.length === 0 ? (
                <div className="py-8 text-center text-gray-400">
                  {employeeFilter === 'blocked' ? 'No blocked employees.' : 'No employees yet.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                  <thead>
                    <tr className="border-b border-red-600/30">
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-left text-red-400 uppercase">Employee</th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-left text-red-400 uppercase">Discord ID</th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-right text-red-400 uppercase">Today Sales</th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-right text-red-400 uppercase">Weekly Sales</th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-right text-red-400 uppercase">Total Sales</th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-center text-red-400 uppercase">Status</th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-center text-red-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-600/30">
                    {filteredStats.map((stat) => (
                      <tr key={stat.employee.id} className="transition-colors hover:bg-red-600/10">
                        <td className="px-4 py-4 text-sm font-medium text-white">{stat.employee.character_name}</td>
                        <td className="px-4 py-4 text-sm text-gray-400">{stat.employee.discord_id}</td>
                        <td className="px-4 py-4 text-sm font-semibold text-right text-white">{formatCurrency(stat.todaySales)}</td>
                        <td className="px-4 py-4 text-sm font-semibold text-right text-white">{formatCurrency(stat.weeklySales)}</td>
                        <td className="px-4 py-4 text-sm font-bold text-right text-red-500">{formatCurrency(stat.totalSales)}</td>
                        <td className="px-4 py-4 text-center">
                          {stat.employee.is_blocked ? (
                            <span className="inline-flex items-center px-2 py-1 text-xs font-semibold text-red-300 rounded bg-red-900/30">
                              <Ban className="w-3 h-3 mr-1" />
                              Blocked
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 text-xs font-semibold text-green-300 rounded bg-green-900/30">
                              <Check className="w-3 h-3 mr-1" />
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleViewSales(stat.employee)}
                              className="p-2 text-blue-400 transition-colors hover:text-blue-300"
                              title="View Sales"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {stat.employee.is_blocked ? (
                              <button
                                onClick={() => handleUnblockEmployee(stat.employee)}
                                className="p-2 text-green-400 transition-colors hover:text-green-300"
                                title="Unblock Employee"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleBlockEmployee(stat.employee)}
                                className="p-2 text-red-400 transition-colors hover:text-red-300"
                                title="Block Employee"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteEmployee(stat.employee)}
                              className="p-2 text-gray-400 transition-colors hover:text-red-500"
                              title="Delete Employee (Permanent)"
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
              )
            )}
          </div>

          {/* Your Sales Table */}
          <div className="p-6 mb-8 border rounded-lg bg-black/60 backdrop-blur-md border-red-600/30">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">Your Sales</h2>
                <p className="text-sm text-gray-400">Sales created by you</p>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleOwnerQuickBill}
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
                <button
                  onClick={() => setShowAllOwnerSales(!showAllOwnerSales)}
                  className="px-4 py-2 text-sm font-bold text-white transition-all transform border rounded bg-black/60 border-red-600/30 hover:bg-red-600/20 hover:scale-105"
                >
                  {showAllOwnerSales ? 'Show Recent' : 'View All'}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-8 text-center text-gray-400">Loading...</div>
            ) : (showAllOwnerSales ? ownerSales : recentOwnerSales).length === 0 ? (
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
                    {(showAllOwnerSales ? ownerSales : recentOwnerSales).map((sale) => (
                      <tr key={sale.id} className="transition-colors hover:bg-red-600/10">
                        <td className="px-4 py-4 text-sm text-gray-400">{formatDate(sale.created_at)}</td>
                        <td className="px-4 py-4 text-sm font-medium text-white">{sale.customer_name}</td>
                        <td className="px-4 py-4 text-sm text-gray-400">{sale.vehicle_plate}</td>
                        <td className="px-4 py-4 text-sm text-center text-gray-400">{sale.item_count || 0}</td>
                        <td className="px-4 py-4 text-sm font-bold text-right text-red-500">{formatCurrency(sale.total_amount)}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleViewOwnerSale(sale)}
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
                              onClick={() => handleDeleteOwnerSale(sale)}
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

      {/* View Employee Sales Modal */}
      {viewingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-gray-900 via-red-950 to-gray-900 border-2 border-red-600/50 rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 p-6 border-b bg-black/80 backdrop-blur-md border-red-600/30">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">{viewingEmployee.character_name}'s Sales</h2>
                  <p className="text-sm text-gray-400">All transactions by this employee</p>
                </div>
                <button
                  onClick={() => {
                    setViewingEmployee(null);
                    setEmployeeSales([]);
                  }}
                  className="text-2xl font-bold text-gray-400 transition-colors hover:text-red-500"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6">
              {employeeSales.length === 0 ? (
                <div className="py-8 text-center text-gray-400">No sales found for this employee.</div>
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
                      {employeeSales.map((sale) => (
                        <tr key={sale.id} className={`transition-colors hover:bg-red-600/10 ${
                          sale.is_fake 
                            ? 'text-yellow-400' 
                            : !sale.is_verified 
                              ? 'bg-orange-900/20 text-orange-300' 
                              : ''
                        }`}>
                          <td className={`px-4 py-4 text-sm ${
                            sale.is_fake 
                              ? '' 
                              : !sale.is_verified 
                                ? '' 
                                : 'text-gray-400'
                          }`}>{formatDate(sale.created_at)}</td>
                          <td className={`px-4 py-4 text-sm font-medium ${
                            sale.is_fake 
                              ? '' 
                              : !sale.is_verified 
                                ? '' 
                                : 'text-white'
                          }`}>{sale.customer_name}</td>
                          <td className={`px-4 py-4 text-sm ${
                            sale.is_fake 
                              ? '' 
                              : !sale.is_verified 
                                ? '' 
                                : 'text-gray-400'
                          }`}>{sale.vehicle_plate}</td>
                          <td className={`px-4 py-4 text-sm text-center ${
                            sale.is_fake 
                              ? '' 
                              : !sale.is_verified 
                                ? '' 
                                : 'text-gray-400'
                          }`}>{sale.item_count}</td>
                          <td className={`px-4 py-4 text-sm font-bold text-right ${
                            sale.is_fake 
                              ? '' 
                              : !sale.is_verified 
                                ? 'text-orange-400' 
                                : 'text-red-500'
                          }`}>{formatCurrency(sale.total_amount)}</td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-center space-x-2">
                              <button
                                onClick={() => handleMarkAsFake(sale)}
                                className={`p-2 transition-colors ${sale.is_fake ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-400 hover:text-yellow-400'}`}
                                title={sale.is_fake ? "Unmark as Fake" : "Mark as Fake"}
                              >
                                <AlertTriangle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleViewSaleBreakdown(sale)}
                                className="p-2 text-blue-400 transition-colors hover:text-blue-300"
                                title="View Breakdown"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteSale(sale)}
                                className="p-2 text-red-400 transition-colors hover:text-red-300"
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
      )}

      {/* Block Employee Dialog */}
      {showBlockDialog && blockingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-8 border-2 rounded-lg shadow-2xl bg-gradient-to-br from-gray-900 via-red-950 to-gray-900 border-red-600/50">
            <div className="mb-6 text-center">
              <div className="flex justify-center mb-4">
                <div className="p-4 rounded-full bg-red-600/20">
                  <Ban className="w-12 h-12 text-red-500" />
                </div>
              </div>
              <h2 className="mb-2 text-2xl font-bold text-red-500">Block Employee</h2>
              <p className="text-sm text-gray-400">
                You are about to block <span className="font-semibold text-white">{blockingEmployee.character_name}</span>
              </p>
            </div>
            
            <div className="mb-6">
              <label className="block mb-2 text-sm font-semibold text-red-400">
                Reason for Blocking *
              </label>
              <textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className="w-full px-4 py-3 text-white placeholder-gray-600 transition-all border rounded resize-none bg-gray-900/50 border-red-600/30 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                placeholder="Enter reason for blocking this employee..."
                rows={4}
                required
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setShowBlockDialog(false);
                  setBlockingEmployee(null);
                  setBlockReason('');
                }}
                className="flex-1 px-6 py-3 font-bold text-white transition-all bg-gray-600 rounded hover:bg-gray-700"
              >
                CANCEL
              </button>
              <button
                onClick={confirmBlockEmployee}
                disabled={!blockReason.trim()}
                className="flex-1 px-6 py-3 font-bold text-white transition-all transform rounded shadow-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                BLOCK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unblock Employee Dialog */}
      {showUnblockDialog && unblockingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-8 border-2 rounded-lg shadow-2xl bg-gradient-to-br from-gray-900 via-green-950 to-gray-900 border-green-600/50">
            <div className="mb-6 text-center">
              <div className="flex justify-center mb-4">
                <div className="p-4 rounded-full bg-green-600/20">
                  <Check className="w-12 h-12 text-green-500" />
                </div>
              </div>
              <h2 className="mb-2 text-2xl font-bold text-white">Unblock Employee</h2>
              <p className="text-gray-400">
                Are you sure you want to unblock <span className="font-semibold text-white">{unblockingEmployee.character_name}</span>?
              </p>
            </div>

            {unblockingEmployee.block_reason && (
              <div className="p-4 mb-6 border rounded-lg bg-gray-900/50 border-gray-700/50">
                <p className="mb-1 text-sm font-semibold text-gray-400">Current Block Reason:</p>
                <p className="text-sm text-white">{unblockingEmployee.block_reason}</p>
              </div>
            )}

            <div className="flex space-x-4">
              <button
                onClick={() => {
                  setShowUnblockDialog(false);
                  setUnblockingEmployee(null);
                }}
                className="flex-1 px-6 py-3 font-bold text-white transition-all bg-gray-600 rounded hover:bg-gray-700"
              >
                CANCEL
              </button>
              <button
                onClick={confirmUnblockEmployee}
                className="flex-1 px-6 py-3 font-bold text-white transition-all transform rounded shadow-lg bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 hover:scale-105"
              >
                UNBLOCK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Employee Dialog */}
      {showDeleteDialog && deletingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg p-8 border-2 rounded-lg shadow-2xl bg-gradient-to-br from-gray-900 via-red-950 to-gray-900 border-red-600/50">
            {deleteConfirmStep === 1 ? (
              <>
                <div className="mb-6 text-center">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 rounded-full bg-red-600/20">
                      <Ban className="w-12 h-12 text-red-500" />
                    </div>
                  </div>
                  <h2 className="mb-2 text-2xl font-bold text-red-500">⚠️ WARNING: DELETE EMPLOYEE</h2>
                  <p className="mb-4 text-gray-400">
                    You are about to <span className="font-bold text-red-500">PERMANENTLY DELETE</span>{' '}
                    <span className="font-semibold text-white">{deletingEmployee.character_name}</span>
                  </p>
                </div>

                <div className="p-4 mb-6 border-2 rounded-lg bg-red-950/30 border-red-600/50">
                  <h3 className="mb-3 font-bold text-red-400">This will permanently delete:</h3>
                  <ul className="space-y-2 text-sm text-gray-300">
                    <li className="flex items-center space-x-2">
                      <X className="w-4 h-4 text-red-500" />
                      <span>Employee account and login access</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <X className="w-4 h-4 text-red-500" />
                      <span>All sales records created by this employee</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <X className="w-4 h-4 text-red-500" />
                      <span>All sale items associated with their sales</span>
                    </li>
                  </ul>
                  <p className="mt-4 font-bold text-center text-red-500">⚠️ THIS ACTION CANNOT BE UNDONE! ⚠️</p>
                </div>

                <div className="flex space-x-4">
                  <button
                    onClick={() => {
                      setShowDeleteDialog(false);
                      setDeletingEmployee(null);
                      setDeleteConfirmStep(1);
                    }}
                    className="flex-1 px-6 py-3 font-bold text-white transition-all bg-gray-600 rounded hover:bg-gray-700"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={() => setDeleteConfirmStep(2)}
                    className="flex-1 px-6 py-3 font-bold text-white transition-all transform rounded shadow-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:scale-105"
                  >
                    CONTINUE
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-6 text-center">
                  <div className="flex justify-center mb-4">
                    <div className="p-4 rounded-full bg-red-600/20">
                      <Trash2 className="w-12 h-12 text-red-500" />
                    </div>
                  </div>
                  <h2 className="mb-2 text-2xl font-bold text-red-500">FINAL CONFIRMATION</h2>
                  <p className="mb-4 text-gray-400">
                    Last chance to cancel. Click <span className="font-bold text-red-500">DELETE NOW</span> to permanently remove{' '}
                    <span className="font-semibold text-white">{deletingEmployee.character_name}</span> and all associated data.
                  </p>
                </div>

                <div className="p-4 mb-6 text-center border-2 rounded-lg bg-red-950/50 border-red-600/70">
                  <p className="text-lg font-bold text-red-400">ARE YOU ABSOLUTELY SURE?</p>
                  <p className="mt-2 text-sm text-gray-300">There is no way to recover this data</p>
                </div>

                <div className="flex space-x-4">
                  <button
                    onClick={() => setDeleteConfirmStep(1)}
                    className="flex-1 px-6 py-3 font-bold text-white transition-all bg-gray-600 rounded hover:bg-gray-700"
                  >
                    GO BACK
                  </button>
                  <button
                    onClick={confirmDeleteEmployee}
                    className="flex-1 px-6 py-3 font-bold text-white transition-all transform rounded shadow-lg bg-gradient-to-r from-red-700 to-red-900 hover:from-red-800 hover:to-red-950 hover:scale-105"
                  >
                    DELETE NOW
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* View Sale Breakdown Modal */}
      {viewingSaleDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-gray-900 via-red-950 to-gray-900 border-2 border-red-600/50 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 p-6 border-b bg-black/80 backdrop-blur-md border-red-600/30">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-red-500">VIEW/EDIT BILL</h2>
                  <p className="mt-1 text-sm text-gray-400">Invoice #{viewingSaleDetails.id.substring(0, 8).toUpperCase()}</p>
                </div>
                <button
                  onClick={handleCloseOwnerSaleView}
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
                    <p className="font-semibold text-white">{viewingSaleDetails.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Vehicle Plate</p>
                    <p className="font-semibold text-white">{viewingSaleDetails.vehicle_plate}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Date</p>
                    <p className="font-semibold text-white">{formatDate(viewingSaleDetails.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Mechanic</p>
                    <p className="font-semibold text-white">{owner?.character_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Total</p>
                    <p className="font-semibold text-red-500">{formatCurrency(viewingSaleDetails.total_amount || 0)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Status</p>
                    <p className={`font-semibold ${
                      viewingSaleDetails.is_fake 
                        ? 'text-yellow-400' 
                        : viewingSaleDetails.is_verified 
                          ? 'text-green-400' 
                          : 'text-orange-400'
                    }`}>
                      {viewingSaleDetails.is_fake 
                        ? 'Marked as Fake' 
                        : viewingSaleDetails.is_verified 
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
                    {viewingSaleItems.map((item) => (
                      <tr key={item.id} className="transition-colors border-b border-red-600/10 hover:bg-red-900/10">
                        <td className="px-4 py-3 text-white">{item.item_name}</td>
                        <td className="px-4 py-3 text-gray-300">{item.item_category}</td>
                        <td className="px-4 py-3 font-semibold text-right text-red-500">
                          {formatCurrency(Number(item.price))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleDeleteOwnerSaleItem(item.id)}
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
                    <span>{formatCurrency(viewingSaleDetails.subtotal || 0)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Discount ({viewingSaleDetails.discount_percentage || 0}%)</span>
                    <span>-{formatCurrency(viewingSaleDetails.discount_amount || 0)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Tax (14%)</span>
                    <span>{formatCurrency(viewingSaleDetails.tax_amount || 0)}</span>
                  </div>
                  <div className="pt-2 border-t border-red-600/30">
                    <div className="flex justify-between text-xl font-bold text-red-500">
                      <span>TOTAL</span>
                      <span>{formatCurrency(viewingSaleDetails.total_amount || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end mt-6 space-x-4">
                <button
                  onClick={handleCloseOwnerSaleView}
                  className="px-6 py-3 font-bold text-white transition-colors bg-gray-600 rounded hover:bg-gray-700"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleUpdateOwnerBill}
                  className="px-6 py-3 font-bold text-white transition-all transform rounded bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 hover:scale-105"
                >
                  SAVE CHANGES
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Sale Confirmation Dialog */}
      {showDeleteSaleDialog && deletingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-8 border-2 rounded-lg shadow-2xl bg-gradient-to-br from-gray-900 via-red-950 to-gray-900 border-red-600/50">
            <div className="mb-6 text-center">
              <div className="flex justify-center mb-4">
                <div className="p-4 rounded-full bg-red-600/20">
                  <Trash2 className="w-12 h-12 text-red-500" />
                </div>
              </div>
              <h2 className="mb-2 text-2xl font-bold text-red-500">Delete Sale</h2>
              <p className="text-sm text-gray-400">
                Are you sure you want to delete this sale?
              </p>
              <p className="mt-2 text-xs font-semibold text-red-400">
                This action cannot be undone!
              </p>
            </div>
            
            <div className="p-4 mb-6 border rounded-lg bg-black/40 border-red-600/30">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Customer</p>
                  <p className="font-semibold text-white">{deletingSale.customer_name}</p>
                </div>
                <div>
                  <p className="text-gray-400">Total</p>
                  <p className="font-semibold text-red-500">{formatCurrency(deletingSale.total_amount)}</p>
                </div>
              </div>
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
                onClick={viewingEmployee ? confirmDeleteSale : confirmDeleteOwnerSale}
                disabled={isDeleting}
                className="flex-1 px-6 py-3 font-bold text-white transition-all transform rounded shadow-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isDeleting ? 'DELETING...' : 'DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Item Confirmation Dialog */}
      {showDeleteItemConfirm && (
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
                  setShowDeleteItemConfirm(false);
                  setItemToDelete(null);
                }}
                className="flex-1 px-6 py-3 font-bold text-white transition-all bg-gray-600 rounded hover:bg-gray-700"
              >
                CANCEL
              </button>
              <button
                onClick={confirmDeleteOwnerSaleItem}
                className="flex-1 px-6 py-3 font-bold text-white transition-all transform rounded shadow-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:scale-105"
              >
                DELETE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Changes Confirmation Dialog */}
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
                onClick={confirmUpdateOwnerBill}
                disabled={isSaving}
                className="flex-1 px-6 py-3 font-bold text-white transition-all transform rounded shadow-lg bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {isSaving ? 'SAVING...' : 'CONFIRM'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark/Unmark as Fake Confirmation Popup */}
      {showMarkFakeDialog && markingFakeSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md p-8 border-2 rounded-lg shadow-2xl bg-gradient-to-br from-gray-900 via-red-950 to-gray-900 border-red-600/50">
            <div className="mb-6 text-center">
              <div className="flex justify-center mb-4">
                <div className={`p-4 rounded-full ${markingFakeSale.is_fake ? 'bg-green-600/20' : 'bg-yellow-600/20'}`}>
                  <svg className={`w-12 h-12 ${markingFakeSale.is_fake ? 'text-green-500' : 'text-yellow-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <h2 className={`mb-2 text-2xl font-bold ${markingFakeSale.is_fake ? 'text-green-500' : 'text-yellow-500'}`}>
                {markingFakeSale.is_fake ? 'Remove Fake Tag' : 'Mark as Fake Sale'}
              </h2>
              <p className="text-sm text-gray-400">
                {markingFakeSale.is_fake 
                  ? `Are you sure you want to remove the fake tag from sale of ${markingFakeSale.customer_name}?`
                  : `Are you sure you want to mark the sale of ${markingFakeSale.customer_name} as fake?`
                }
              </p>
              <p className="mt-2 text-xs font-semibold text-red-400">
                {markingFakeSale.is_fake 
                  ? 'This will restore the sale amount to employee totals and revenue.'
                  : 'This will exclude the sale amount from employee totals and revenue.'
                }
              </p>
            </div>
            
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setShowMarkFakeDialog(false);
                  setMarkingFakeSale(null);
                }}
                className="flex-1 px-6 py-3 font-bold text-white transition-all bg-gray-600 rounded hover:bg-gray-700"
              >
                CANCEL
              </button>
              <button
                onClick={confirmMarkAsFake}
                disabled={isMarkingFake}
                className={`flex-1 px-6 py-3 font-bold text-white transition-all transform rounded shadow-lg ${
                  markingFakeSale.is_fake 
                    ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800'
                    : 'bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800'
                } hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
              >
                {isMarkingFake 
                  ? (markingFakeSale.is_fake ? 'REMOVING TAG...' : 'MARKING FAKE...') 
                  : (markingFakeSale.is_fake ? 'REMOVE TAG' : 'MARK FAKE')
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Announcement Dialog */}
      {showAnnouncementDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl p-8 border-2 rounded-lg shadow-2xl bg-gradient-to-br from-gray-900 via-red-950 to-gray-900 border-red-600/50">
            <div className="mb-6">
              <h2 className="mb-2 text-2xl font-bold text-red-500">
                {editingAnnouncement ? 'Edit Announcement' : 'Create Announcement'}
              </h2>
              <p className="text-sm text-gray-400">
                {editingAnnouncement ? 'Update the announcement message and expiry time' : 'Create a new announcement for all employees'}
              </p>
            </div>

            <div className="mb-6 space-y-4">
              <div>
                <label className="block mb-2 text-sm font-semibold text-red-400">Announcement Message</label>
                <textarea
                  value={announcementMessage}
                  onChange={(e) => setAnnouncementMessage(e.target.value)}
                  placeholder="Enter announcement message..."
                  rows={4}
                  className="w-full px-4 py-3 text-white border rounded resize-none bg-gray-900/50 border-red-600/30 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-semibold text-red-400">Expires In (Hours)</label>
                <input
                  type="number"
                  value={announcementExpiry}
                  onChange={(e) => setAnnouncementExpiry(Math.max(1, parseInt(e.target.value) || 1))}
                  min="1"
                  className="w-full px-4 py-3 text-white border rounded bg-gray-900/50 border-red-600/30 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Announcement will expire on: {new Date(Date.now() + announcementExpiry * 60 * 60 * 1000).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => {
                  setShowAnnouncementDialog(false);
                  setAnnouncementMessage('');
                  setAnnouncementExpiry(24);
                  setEditingAnnouncement(false);
                }}
                className="flex-1 px-6 py-3 font-bold text-white transition-all bg-gray-600 rounded hover:bg-gray-700"
              >
                CANCEL
              </button>
              <button
                onClick={editingAnnouncement ? handleUpdateAnnouncement : handleCreateAnnouncement}
                disabled={!announcementMessage.trim()}
                className="flex-1 px-6 py-3 font-bold text-white transition-all transform rounded shadow-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {editingAnnouncement ? 'UPDATE' : 'CREATE'}
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
              <span>Owner Panel</span>
              <span>•</span>
              <span>Dragon Auto Shop</span>
              <span>•</span>
              <span>Hydra Roleplay</span>
              <span>•</span>
              <img src="/logo.png" alt="Dragon" className="inline-block w-5 h-5" />
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
