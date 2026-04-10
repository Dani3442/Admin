'use client'

import { createBrowserClient } from '@supabase/ssr'
import { getSupabasePublishableKey, getSupabaseUrl } from './shared'

export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey())
}
