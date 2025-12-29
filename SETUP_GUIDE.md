# 🔧 DRAGON AUTO SHOP - SUPABASE SETUP GUIDE

## ✅ Step 1: Get Your Supabase Credentials

1. Go to: https://supabase.com/dashboard/project/ndagnibxqadhjibiufpp
2. Click **Settings** (gear icon) → **API**
3. Copy these values:

   - **Project URL**: `https://ndagnibxqadhjibiufpp.supabase.co`
   - **anon public key**: Copy the long `eyJhbGc...` key

## ✅ Step 2: Update Your .env File

1. Open `.env` file in your project
2. Replace with:

```env
VITE_SUPABASE_URL=https://ndagnibxqadhjibiufpp.supabase.co
VITE_SUPABASE_ANON_KEY=paste_your_anon_key_here
```

## ✅ Step 3: Run Database Setup

1. Go to: https://supabase.com/dashboard/project/ndagnibxqadhjibiufpp/sql/new
2. Open `SUPABASE_SETUP.sql` file in your project
3. Copy **ALL** the SQL code
4. Paste into Supabase SQL Editor
5. Click **RUN** button
6. Wait for "Success" message

## ✅ Step 4: Verify Tables Created

1. Go to: https://supabase.com/dashboard/project/ndagnibxqadhjibiufpp/editor
2. You should see 3 tables:
   - ✓ employees
   - ✓ sales
   - ✓ sale_items

## ✅ Step 5: Test Registration

1. Run: `npm run dev`
2. Open: http://localhost:5173
3. Register with:
   - **Character Name**: Your name
   - **Discord ID**: Your Discord ID
   - **Verification Key**: `HRPDRAGON`

## 🐛 Troubleshooting

### "Missing Supabase environment variables"

→ Check your `.env` file exists and has correct values

### "Could not find verification_key column"

→ Re-run the SQL setup script in Supabase SQL Editor

### "Registration failed"

→ Check browser console (F12) for detailed error
→ Verify .env file is correct

## 📞 Need Help?

Check the SQL Editor at: https://supabase.com/dashboard/project/ndagnibxqadhjibiufpp/sql/new
