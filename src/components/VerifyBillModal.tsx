import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { editDiscordMessage } from '../lib/discord';
import { getEmployee } from '../lib/auth';
import { X, Upload, Check, AlertCircle } from 'lucide-react';

interface VerifyBillModalProps {
  saleId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function VerifyBillModal({ saleId, onClose, onSuccess }: VerifyBillModalProps) {
  const [carImage, setCarImage] = useState<File | null>(null);
  const [mechanicSheet, setMechanicSheet] = useState<File | null>(null);
  const [carImagePreview, setCarImagePreview] = useState<string>('');
  const [mechanicSheetPreview, setMechanicSheetPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!carImage || !mechanicSheet) {
      setError('Please upload both images');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const employee = getEmployee();

      // Get the sale details
      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .single();

      if (saleError) throw saleError;

      // Get sale items
      const { data: items, error: itemsError } = await supabase
        .from('sale_items')
        .select('*')
        .eq('sale_id', saleId);

      if (itemsError) throw itemsError;

      // Update the sale with verification data
      const { error: updateError } = await supabase
        .from('sales')
        .update({
          is_verified: true,
          verified_at: new Date().toISOString()
        })
        .eq('id', saleId);

      if (updateError) throw updateError;

      // Edit Discord message to attach verification images
      if (sale.discord_message_id && employee) {
        const billDate = new Date(sale.created_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const discordSuccess = await editDiscordMessage(
          sale.discord_message_id,
          {
            saleId: sale.id,
            date: billDate,
            mechanicName: employee.character_name,
            mechanicDiscordId: employee.discord_id,
            customerName: sale.customer_name,
            plateNumber: sale.vehicle_plate,
            totalItems: items?.length || 0,
            amount: sale.total_amount,
            items: items?.map((item: any) => ({
              name: item.item_name,
              category: item.item_category,
              type: item.item_type,
              quantity: item.quantity,
              price: Number(item.price)
            })) || []
          },
          employee.id,
          sale.is_fake,
          {
            carImage,
            mechanicSheet
          }
        );

        if (discordSuccess) {
          onSuccess();
          onClose();
        } else {
          console.warn('Failed to update Discord message with verification images');
          setError('Failed to update Discord message with verification images');
          setUploading(false);
          return;
        }
      } else {
        onSuccess();
        onClose();
      }
    } catch (err) {
      console.error('Verification error:', err);
      setError('Failed to verify bill. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 via-red-950/20 to-gray-900 border-2 border-red-600/30 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-gradient-to-r from-gray-900 to-red-950/30 border-b border-red-600/30 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-red-500">Verify Bill</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-900/20 border border-red-600/50 text-red-400 px-4 py-3 rounded flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {error}
            </div>
          )}

          {/* Car Image with Numberplate */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Car Picture with Numberplate *
            </label>
            <div className="space-y-3">
              <input
                type="file"
                accept="image/*"
                onChange={handleCarImageChange}
                className="hidden"
                id="car-image"
              />
              <label
                htmlFor="car-image"
                className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-red-600/30 rounded-lg cursor-pointer hover:border-red-600/60 transition-colors bg-gray-900/50"
              >
                <Upload className="w-5 h-5 text-red-500" />
                <span className="text-gray-300">
                  {carImage ? carImage.name : 'Choose car image'}
                </span>
              </label>
              {carImagePreview && (
                <div className="relative">
                  <img
                    src={carImagePreview}
                    alt="Car preview"
                    className="w-full h-48 object-cover rounded-lg border border-red-600/30"
                  />
                  <div className="absolute top-2 right-2 bg-green-600 text-white px-2 py-1 rounded-full text-xs flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Uploaded
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mechanic Sheet Image */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Mechanic Sheet Image *
            </label>
            <div className="space-y-3">
              <input
                type="file"
                accept="image/*"
                onChange={handleMechanicSheetChange}
                className="hidden"
                id="mechanic-sheet"
              />
              <label
                htmlFor="mechanic-sheet"
                className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-red-600/30 rounded-lg cursor-pointer hover:border-red-600/60 transition-colors bg-gray-900/50"
              >
                <Upload className="w-5 h-5 text-red-500" />
                <span className="text-gray-300">
                  {mechanicSheet ? mechanicSheet.name : 'Choose mechanic sheet'}
                </span>
              </label>
              {mechanicSheetPreview && (
                <div className="relative">
                  <img
                    src={mechanicSheetPreview}
                    alt="Mechanic sheet preview"
                    className="w-full h-48 object-cover rounded-lg border border-red-600/30"
                  />
                  <div className="absolute top-2 right-2 bg-green-600 text-white px-2 py-1 rounded-full text-xs flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Uploaded
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!carImage || !mechanicSheet || uploading}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Verify Bill
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
