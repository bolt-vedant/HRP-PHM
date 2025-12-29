-- ============================================
-- DRAGON AUTO SHOP - COMPLETE DATABASE SETUP
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================

-- Step 1: Clean up existing tables
DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS employees CASCADE;

-- Step 2: Create employees table
CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_name text UNIQUE NOT NULL,
  discord_id text UNIQUE NOT NULL,
  verification_key text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Step 3: Create sales table
CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) NOT NULL,
  customer_name text NOT NULL,
  vehicle_plate text NOT NULL,
  discount_percentage numeric DEFAULT 0,
  subtotal numeric NOT NULL,
  discount_amount numeric DEFAULT 0,
  tax_amount numeric NOT NULL,
  total_amount numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Step 4: Create sale_items table
CREATE TABLE sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES sales(id) ON DELETE CASCADE NOT NULL,
  item_name text NOT NULL,
  item_category text NOT NULL,
  item_type text NOT NULL,
  quantity integer DEFAULT 1,
  price numeric NOT NULL,
  subtotal numeric NOT NULL
);

-- Step 5: Enable Row Level Security
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS Policies for employees
CREATE POLICY "Anyone can register as employee"
  ON employees FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can view employees"
  ON employees FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Employees can update own profile"
  ON employees FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Step 7: Create RLS Policies for sales
DROP POLICY IF EXISTS "Anyone can view sales" ON sales;
CREATE POLICY "Anyone can view sales"
  ON sales FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can create sales" ON sales;
CREATE POLICY "Anyone can create sales"
  ON sales FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update sales" ON sales;
CREATE POLICY "Anyone can update sales"
  ON sales FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can delete sales" ON sales;
CREATE POLICY "Anyone can delete sales"
  ON sales FOR DELETE
  TO anon, authenticated
  USING (true);

-- Step 8: Create RLS Policies for sale_items
DROP POLICY IF EXISTS "Anyone can view sale items" ON sale_items;
CREATE POLICY "Anyone can view sale items"
  ON sale_items FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can create sale items" ON sale_items;
CREATE POLICY "Anyone can create sale items"
  ON sale_items FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update sale items" ON sale_items;
CREATE POLICY "Anyone can update sale items"
  ON sale_items FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can delete sale items" ON sale_items;
CREATE POLICY "Anyone can delete sale items"
  ON sale_items FOR DELETE
  TO anon, authenticated
  USING (true);

-- Step 9: Create indexes for performance
CREATE INDEX idx_sales_employee_id ON sales(employee_id);
CREATE INDEX idx_sales_created_at ON sales(created_at DESC);
CREATE INDEX idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX idx_employees_character_name ON employees(character_name);
CREATE INDEX idx_employees_discord_id ON employees(discord_id);

-- Step 10: Add verification fields to sales table
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS verified_at timestamptz,
ADD COLUMN IF NOT EXISTS discord_message_id text;

CREATE INDEX IF NOT EXISTS idx_sales_verified ON sales(is_verified);

-- Step 11: Refresh schema cache
NOTIFY pgrst, 'reload schema';

-- DONE! Your database is ready.
