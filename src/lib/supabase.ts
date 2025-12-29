import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Employee {
  id: string;
  character_name: string;
  discord_id: string;
  verification_key: string;
  is_blocked?: boolean;
  block_reason?: string;
  blocked_at?: string;
  created_at: string;
}

export interface Owner {
  id: string;
  character_name: string;
  discord_id: string;
  verification_key: string;
  created_at: string;
}

export interface Sale {
  id: string;
  employee_id: string;
  customer_name: string;
  vehicle_plate: string;
  discount_percentage: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  created_at: string;
  item_count?: number;
  is_fake?: boolean;
  is_verified?: boolean;
  verified_at?: string;
  discord_message_id?: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  item_name: string;
  item_category: string;
  item_type: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface Announcement {
  id: string;
  message: string;
  expires_at: string;
  created_at: string;
  created_by: string;
}
