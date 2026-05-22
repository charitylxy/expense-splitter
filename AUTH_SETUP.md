# Authentication Setup Guide

## Step 1: Enable Supabase Auth (if not already enabled)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **Authentication** → **Providers** in the left sidebar
4. Verify that **Email** provider is enabled (it should be by default)
5. Go to **Settings** (under Authentication) and configure:

   - **Site URL**: `http://localhost:3000` (for local development)
   - **Redirect URLs**: Add these lines (one URL per line):
     ```
     http://localhost:3000/auth/callback
     https://your-app-name.vercel.app/auth/callback
     ```

6. Click **Save**

## Step 2: Run the Auth Migration

**IMPORTANT:** This updates your database to support user-based access control.

1. In Supabase Dashboard, go to **SQL Editor** → **New query**
2. Copy the entire contents of `supabase/auth_migration.sql` from your project folder
3. Paste it into the SQL Editor
4. Click **Execute** (or press Ctrl+Enter)
5. You should see success messages for all policy updates (no errors)

**What this does:**
- Adds a `created_by` column to groups (tracks who owns each group)
- Creates a `group_members` table (for sharing groups with other users)
- Updates RLS policies to enforce per-user access control

## Step 3: Test Locally

1. Run the dev server:
   ```bash
   npm run dev
   ```

2. Open http://localhost:3000

3. You should see a **Sign Up** button in the header

4. Click **Sign Up** and create a test account with your email

5. After submission, you'll see a "Check Your Email" page

6. Go to Supabase Dashboard → **Authentication** → **Email Confirmations** tab

7. Find the confirmation email and copy the confirmation link

8. Paste that link in your browser to verify your email

9. Go back to http://localhost:3000 and **Sign In** with your email/password

10. Create a group - notice `created_by` is automatically set to your user ID

## Step 4: Deploy to Vercel

1. Your code is already committed to GitHub (commit `ab38551`)
2. Vercel will auto-deploy within 1-2 minutes
3. Once deployed, update Supabase Authentication → **Settings** → **Redirect URLs**:
   ```
   https://your-app-name.vercel.app/auth/callback
   ```
   (Replace with your actual Vercel domain)

## Troubleshooting

**"Can't find confirmation email link"**
- Supabase doesn't send real emails on the free tier by default
- Go to your Supabase Dashboard → **Authentication** → **Email Confirmations** tab
- You'll see all signup requests; click the row to see the confirmation link

**"Getting 'policy violation' errors" or "No groups showing up"**
- The auth migration may not have completed fully
- Go back to Supabase **SQL Editor** and re-run `supabase/auth_migration.sql`
- Make sure all commands execute without errors

**"Blank page or infinite redirect loop"**
- Hard refresh the page (Ctrl+Shift+R on Windows/Linux, Cmd+Shift+R on Mac)
- Clear browser cookies for localhost (F12 → Application → Cookies → Delete)
- Check browser console (F12 → Console) for error messages

**"Group creation fails with 'Created_by is required'"**
- Make sure you're signed in (your email should appear in the header)
- Check that the `created_by` column was added to the groups table in the migration

## What Was Added

### New Files
- `app/auth/signup/page.tsx` - Sign up form
- `app/auth/login/page.tsx` - Sign in form
- `app/auth/verify-email/page.tsx` - Email verification status page
- `app/auth/callback/route.ts` - Auth callback handler
- `app/providers.tsx` - AuthProvider context for auth state
- `components/header.tsx` - Header with user menu and logout
- `lib/supabase/client.ts` - Supabase client factory
- `supabase/auth_migration.sql` - Database schema updates
- `AUTH_SETUP.md` - This setup guide

### Updated Files
- `app/layout.tsx` - Wrapped app with AuthProvider, uses new Header component
- `app/page.tsx` - Updated to fetch user's own groups only, with auth redirect
- `app/groups/new/page.tsx` - Sets `created_by` when creating groups
- `lib/types.ts` - Added `created_by` to Group interface, new GroupMember interface
- `package.json` - No new dependencies (already had @supabase/supabase-js)
