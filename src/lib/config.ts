/**
 * 환경 설정만 담는다. 여기서는 어떤 라이브러리도 import 하지 않는다.
 *
 * supabaseClient.ts 에 이 값을 두면 @supabase/supabase-js (약 230kB) 가
 * 이 파일을 읽는 모든 모듈로 따라 들어온다. 로컬 모드로 쓰는 사람은
 * 쓰지도 않는 라이브러리를 내려받게 된다. 그래서 설정만 따로 뗀다.
 */

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)
