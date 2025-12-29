-- ============================================
-- OWNER PANEL - DATABASE SETUP
-- Run this script in Supabase SQL Editor
-- ============================================

-- Step 1: Create owners table
CREATE TABLE IF NOT EXISTS owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_name text UNIQUE NOT NULL,
  discord_id text UNIQUE NOT NULL,
  verification_key text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Step 2: Add is_blocked and block_reason to employees table
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS is_blocked boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS block_reason text,
ADD COLUMN IF NOT EXISTS blocked_at timestamptz;

-- Step 2b: Create policy to allow anyone to update employees (for blocking)
DROP POLICY IF EXISTS "Anyone can update employees" ON employees;
CREATE POLICY "Anyone can update employees"
  ON employees FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Step 2c: Create policy to allow anyone to delete employees
DROP POLICY IF EXISTS "Anyone can delete employees" ON employees;
CREATE POLICY "Anyone can delete employees"
  ON employees FOR DELETE
  TO anon, authenticated
  USING (true);

-- Step 3: Enable Row Level Security for owners
ALTER TABLE owners ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS Policies for owners
DROP POLICY IF EXISTS "Anyone can register as owner" ON owners;
CREATE POLICY "Anyone can register as owner"
  ON owners FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view owners" ON owners;
CREATE POLICY "Anyone can view owners"
  ON owners FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Owners can update own profile" ON owners;
CREATE POLICY "Owners can update own profile"
  ON owners FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Step 5: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_owners_character_name ON owners(character_name);
CREATE INDEX IF NOT EXISTS idx_owners_discord_id ON owners(discord_id);
CREATE INDEX IF NOT EXISTS idx_employees_is_blocked ON employees(is_blocked);

-- Step 6: Insert default owner (CHANGE THESE VALUES!)
INSERT INTO owners (character_name, discord_id, verification_key)
VALUES ('reaperftw', '1331929618529255466', 'REAPERHRPMECHANIC')
ON CONFLICT (character_name) DO NOTHING;

-- Add second owner
INSERT INTO owners (character_name, discord_id, verification_key)
VALUES ('godfather', '996068318735777934', 'GODHRPMECHANIC')
ON CONFLICT (character_name) DO NOTHING;
