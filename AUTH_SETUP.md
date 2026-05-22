# Authentication Setup Guide

## Step 1: Enable Supabase Auth

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **Authentication** → **Providers** in the sidebar
4. Make sure **Email** is enabled (it should be by default)
5. Optionally enable other providers (Google, GitHub, etc.)
6. Go to **Settings** and configure your:
   - **Site URL**: `http://localhost:3000` (for local development)
   - **Redirect URLs**: Add both:
     - `http://localhost:3000/auth/callback`
     - `https://your-vercel-domain.vercel.app/auth/callback`

## Step 2: Run the Auth Migration

1. In Supabase Dashboard, go to **SQL Editor**
2. Create a new query
3. Copy the entire contents of `supabase/auth_migration.sql`
4. Paste it into the SQL Editor
5. Run the query (click **Execute** or press Ctrl+Enter)
6. You should see success messages for all the policies

## Step 3: Install Dependencies

In your terminal, run:
```bash
npm install
```

This will install the new `@supabase/ssr` package needed for the middleware.

## Step 4: Create Auth Callback Route

Create `app/auth/callback/route.ts`:

```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.delete({ name, ...options })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return NextResponse.redirect(new URL('/auth/login', request.url))
}
```

## Step 5: Update Supabase Client

Make sure your `lib/supabase/client.ts` uses the new Supabase auth correctly:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

## Step 6: Test Locally

1. Run `npm run dev`
2. You should see the app loading
3. Click **Sign Up** in the header
4. Create a test account with your email
5. You'll be redirected to a verification page
6. Verify your email (in development, check the Supabase dashboard for the confirmation link)
7. Return to the app and sign in

## Step 7: Deploy to Vercel

1. Commit your changes:
   ```bash
   git add .
   git commit -m "Add authentication with Supabase Auth"
   git push
   ```

2. Vercel will auto-deploy

3. Once deployed, update your Supabase project's **Redirect URLs** to include your Vercel domain (e.g., `https://your-app.vercel.app/auth/callback`)

## Troubleshooting

**RLS Policies Error:**
- If you get "policy violation" errors, make sure the `auth_migration.sql` ran without errors

**Auth Redirect Loop:**
- Make sure your middleware is not catching all routes
- Check that redirect URLs in Supabase match your app domain

**Database Queries Not Returning Data:**
- Verify that `created_by` is set when creating groups
- Check that group access policies are working in the SQL Editor

## Next Steps

After auth is working, you can:
1. Test group creation and sharing
2. Implement group member invitations (email-based)
3. Add social login providers (Google, GitHub)
