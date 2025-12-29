import { supabase } from './supabase';

interface BillDetails {
  saleId: string;
  date: string;
  mechanicName: string;
  mechanicDiscordId: string;
  customerName: string;
  plateNumber: string;
  totalItems: number;
  amount: number;
  items: Array<{
    name: string;
    category: string;
    type: string;
    quantity: number;
    price: number;
  }>;
}

/**
 * Get weekly sales total for a specific employee
 */
async function getWeeklySales(employeeId: string): Promise<number> {
  // Get date range for current week (Monday to Sunday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // adjust when day is Sunday
  
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from('sales')
    .select('total_amount')
    .eq('employee_id', employeeId)
    .gte('created_at', monday.toISOString())
    .lte('created_at', sunday.toISOString());

  if (error) {
    console.error('Error fetching weekly sales:', error);
    return 0;
  }

  return data.reduce((sum, sale) => sum + (sale.total_amount || 0), 0);
}

/**
 * Send bill notification to Discord webhook
 * Returns message ID if successful, null if failed
 */
export async function sendDiscordNotification(
  billDetails: BillDetails,
  employeeId: string,
  isVerified?: boolean,
  verificationImages?: { carImage: File; mechanicSheet: File }
): Promise<string | null> {
  const webhookUrl = import.meta.env.VITE_DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error('Discord webhook URL not configured in environment variables');
    return null;
  }

  console.log('Attempting to send Discord notification...');

  try {
    // Get weekly sales for this employee
    const weeklySales = await getWeeklySales(employeeId);

    // Format items list - show only first 2 items if there are more
    const displayItems = billDetails.items.slice(0, 2);
    const remainingCount = billDetails.items.length - 2;
    
    const itemsList = displayItems
      .map((item, idx) => 
        `${idx + 1}. **${item.name}** (${item.type}) - ${item.category}\n   Qty: ${item.quantity} × $${item.price.toLocaleString()} = $${(item.price * item.quantity).toLocaleString()}`
      )
      .join('\n') + (remainingCount > 0 ? `\n\n*...and ${remainingCount} more item${remainingCount > 1 ? 's' : ''}*` : '');

    const fields = [
      {
        name: '📅 Date',
        value: billDetails.date,
        inline: true
      },
      {
        name: '🔧 Mechanic',
        value: `${billDetails.mechanicName} (<@${billDetails.mechanicDiscordId}>)`,
        inline: true
      },
      {
        name: '👤 Customer',
        value: billDetails.customerName,
        inline: true
      },
      {
        name: '🚗 Vehicle Plate',
        value: billDetails.plateNumber,
        inline: true
      },
      {
        name: '📦 Total Items',
        value: billDetails.totalItems.toString(),
        inline: true
      },
      {
        name: '💰 Bill Amount',
        value: `$${billDetails.amount.toLocaleString()}`,
        inline: true
      },
      {
        name: '📊 Weekly Sales (This Mechanic)',
        value: `$${weeklySales.toLocaleString()}`,
        inline: false
      },
      {
        name: '🛠️ Items & Services',
        value: itemsList || 'No items',
        inline: false
      }
    ];

    if (isVerified) {
      fields.push({
        name: '✅ Verification Status',
        value: verificationImages ? '**VERIFIED** - Images attached below' : '**AUTO-VERIFIED** (Repair Bill)',
        inline: false
      });
    }

    // Create Discord embed
    const embed: any = {
      title: isVerified ? '✅ New Bill Created (Verified)' : '🧾 New Bill Created',
      color: isVerified ? 0x10b981 : 0xdc2626,
      fields,
      footer: {
        text: `Bill ID: #${billDetails.saleId} | Dragon Auto Shop`
      },
      timestamp: new Date().toISOString()
    };

    // Add image attachments if verification images are provided
    if (verificationImages) {
      embed.image = { url: 'attachment://car_image.jpg' };
      embed.thumbnail = { url: 'attachment://mechanic_sheet.jpg' };
    }

    console.log('Sending to Discord webhook...');

    // Send to Discord with wait=true to get message data back
    let response;
    if (verificationImages) {
      // Use FormData for file uploads
      const formData = new FormData();
      formData.append('files[0]', verificationImages.carImage, 'car_image.jpg');
      formData.append('files[1]', verificationImages.mechanicSheet, 'mechanic_sheet.jpg');
      formData.append('payload_json', JSON.stringify({
        username: 'Dragon Auto Shop',
        embeds: [embed]
      }));

      response = await fetch(`${webhookUrl}?wait=true`, {
        method: 'POST',
        body: formData
      });
    } else {
      // Regular JSON request without files
      response = await fetch(`${webhookUrl}?wait=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'Dragon Auto Shop',
          embeds: [embed]
        })
      });
    }

    console.log('Discord response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Discord webhook error response:', errorText);
      throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
    }

    const messageData = await response.json();
    console.log('Discord notification sent successfully, message ID:', messageData.id);
    return messageData.id;
  } catch (error) {
    console.error('Failed to send Discord notification:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    return null;
  }
}

/**
 * Upload image to Discord and get the URL
 */
export async function uploadImageToDiscord(file: File): Promise<string | null> {
  const webhookUrl = import.meta.env.VITE_DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error('Discord webhook URL not configured');
    return null;
  }

  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    const data = await response.json();
    
    // Discord returns the attachment URL in the response
    if (data.attachments && data.attachments.length > 0) {
      return data.attachments[0].url;
    }

    return null;
  } catch (error) {
    console.error('Failed to upload image to Discord:', error);
    return null;
  }
}

/**
 * Edit Discord message
 */
export async function editDiscordMessage(
  messageId: string,
  billDetails: BillDetails,
  employeeId: string,
  isFake?: boolean,
  verificationImages?: { carImage: File; mechanicSheet: File }
): Promise<boolean> {
  const webhookUrl = import.meta.env.VITE_DISCORD_WEBHOOK_URL;

  if (!webhookUrl || !messageId) {
    console.error('Discord webhook URL or message ID not configured');
    return false;
  }

  try {
    // First, fetch the existing message to preserve verification images
    const getResponse = await fetch(`${webhookUrl}/messages/${messageId}`);
    let existingImageUrl: string | null = null;
    let existingThumbnailUrl: string | null = null;

    if (getResponse.ok) {
      const existingMessage = await getResponse.json();
      if (existingMessage.embeds && existingMessage.embeds.length > 0) {
        const embed = existingMessage.embeds[0];
        if (embed.image && embed.image.url) {
          existingImageUrl = embed.image.url;
        }
        if (embed.thumbnail && embed.thumbnail.url) {
          existingThumbnailUrl = embed.thumbnail.url;
        }
      }
    }

    const weeklySales = await getWeeklySales(employeeId);

    const displayItems = billDetails.items.slice(0, 2);
    const remainingCount = billDetails.items.length - 2;
    
    const itemsList = displayItems
      .map((item, idx) => 
        `${idx + 1}. **${item.name}** (${item.type}) - ${item.category}\n   Qty: ${item.quantity} × $${item.price.toLocaleString()} = $${(item.price * item.quantity).toLocaleString()}`
      )
      .join('\n') + (remainingCount > 0 ? `\n\n*...and ${remainingCount} more item${remainingCount > 1 ? 's' : ''}*` : '');

    const fields = [
      {
        name: '📅 Date',
        value: billDetails.date,
        inline: true
      },
      {
        name: '🔧 Mechanic',
        value: `${billDetails.mechanicName} (<@${billDetails.mechanicDiscordId}>)`,
        inline: true
      },
      {
        name: '👤 Customer',
        value: billDetails.customerName,
        inline: true
      },
      {
        name: '🚗 Vehicle Plate',
        value: billDetails.plateNumber,
        inline: true
      },
      {
        name: '📦 Total Items',
        value: billDetails.totalItems.toString(),
        inline: true
      },
      {
        name: '💰 Bill Amount',
        value: `$${billDetails.amount.toLocaleString()}`,
        inline: true
      },
      {
        name: '📊 Weekly Sales (This Mechanic)',
        value: `$${weeklySales.toLocaleString()}`,
        inline: false
      },
      {
        name: '🛠️ Items & Services',
        value: itemsList || 'No items',
        inline: false
      }
    ];

    const hasVerification = verificationImages || (existingImageUrl && existingThumbnailUrl);

    if (hasVerification) {
      fields.push({
        name: '✅ Verification Status',
        value: '**VERIFIED** - Images attached below',
        inline: false
      });
    }

    const embed: any = {
      title: isFake ? '⚠️ FAKE BILL (MARKED)' : (hasVerification ? '✅ Bill Verified' : '🧾 Bill Updated'),
      color: isFake ? 0xfbbf24 : (hasVerification ? 0x10b981 : 0xdc2626),
      fields,
      footer: {
        text: `Bill ID: #${billDetails.saleId} | Dragon Auto Shop${isFake ? ' | MARKED AS FAKE' : ''}`
      },
      timestamp: new Date().toISOString()
    };

    const formData = new FormData();
    
    if (verificationImages) {
      formData.append('files[0]', verificationImages.carImage, 'car_image.jpg');
      formData.append('files[1]', verificationImages.mechanicSheet, 'mechanic_sheet.jpg');
      embed.image = { url: 'attachment://car_image.jpg' };
      embed.thumbnail = { url: 'attachment://mechanic_sheet.jpg' };
    } else if (existingImageUrl && existingThumbnailUrl) {
      // Preserve existing verification images
      embed.image = { url: existingImageUrl };
      embed.thumbnail = { url: existingThumbnailUrl };
    }

    formData.append('payload_json', JSON.stringify({ embeds: [embed] }));

    const response = await fetch(`${webhookUrl}/messages/${messageId}`, {
      method: 'PATCH',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Failed to edit message: ${response.status}`);
    }

    console.log('Discord message edited successfully');
    return true;
  } catch (error) {
    console.error('Failed to edit Discord message:', error);
    return false;
  }
}

/**
 * Delete Discord message
 */
export async function deleteDiscordMessage(messageId: string): Promise<boolean> {
  const webhookUrl = import.meta.env.VITE_DISCORD_WEBHOOK_URL;

  if (!webhookUrl || !messageId) {
    console.error('Discord webhook URL or message ID not configured');
    return false;
  }

  try {
    const response = await fetch(`${webhookUrl}/messages/${messageId}`, {
      method: 'DELETE'
    });

    if (!response.ok && response.status !== 204) {
      throw new Error(`Failed to delete message: ${response.status}`);
    }

    console.log('Discord message deleted successfully');
    return true;
  } catch (error) {
    console.error('Failed to delete Discord message:', error);
    return false;
  }
}
