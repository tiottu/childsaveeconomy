import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseConfig, supabaseAnonKey, supabaseUrl } from './config'

let client: SupabaseClient | null = null

/**
 * Supabase 클라이언트. 앱 전체가 하나를 공유한다.
 * 설정이 없으면 null — 그 경우 앱은 localStorage 모드로 돈다.
 *
 * 이 파일은 로컬 모드에서 아예 불려지지 않아야 한다 (번들 크기).
 * 그래서 다른 모듈은 이 파일을 동적 import 로만 가져온다.
 */
export function supabase(): SupabaseClient | null {
  if (!hasSupabaseConfig) return null
  if (!client) {
    client = createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // 기기 단위로 붙이는 앱이라 세션을 이 기기에 계속 둔다
        storageKey: 'jjbank.auth',
      },
    })
  }
  return client
}
