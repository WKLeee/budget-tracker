import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://oximqvfzgegrmhqsetyw.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94aW1xdmZ6Z2Vncm1ocXNldHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTA0NzEsImV4cCI6MjA5NTQyNjQ3MX0.mO9fCZc2x9MuBCDmSMQCXXLGSnq6jNdO-vq3WEBBrZI'

  return createBrowserClient(url, key)
}
