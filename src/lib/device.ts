import { supabase } from './supabaseClient'

/**
 * 기기 등록.
 *
 * 부모는 이메일 + PIN 으로 로그인한다. 그 계정을 가족이 공유하고, 기기마다
 * "나는 엄마 / 아빠 / 아이 ○○" 를 지정한다. 아빠가 쓰는 이름표는 다른 기기가 못 쓴다.
 *
 * 같은 이메일로 로그인하면 user_id 가 하나라서 member 로는 기기를 구분할 수 없다.
 * 그래서 기기가 만든 id 를 키로 쓰는 device 표를 따로 둔다 (마이그레이션 0009).
 */

const DEVICE_ID_KEY = 'jjbank.deviceId'

export type DeviceRole =
  | { kind: 'parent'; label: '엄마' | '아빠' }
  | { kind: 'child'; childId: string }

export type OpenSlot =
  | { kind: 'parent'; label: '엄마' | '아빠' }
  | { kind: 'child'; childId: string; childName: string }

/** 이 기기의 id. 없으면 만들어 보관한다. 서버가 발급하지 않는다. */
export function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const fresh = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, fresh)
    return fresh
  } catch {
    // localStorage 를 못 쓰는 환경에서는 이번 세션 동안만 유효한 id 를 쓴다
    return crypto.randomUUID()
  }
}

export function forgetDeviceId(): void {
  try {
    localStorage.removeItem(DEVICE_ID_KEY)
  } catch {
    // 무시
  }
}

function client() {
  const sb = supabase()
  if (!sb) throw new Error('Supabase 설정이 없습니다')
  return sb
}

/** 마이그레이션 0009 가 아직 안 올라간 서버인지 */
function isMissingFunction(error: { code?: string; message: string }): boolean {
  return error.code === 'PGRST202' || /Could not find the function/i.test(error.message)
}

/** device 기능을 쓸 수 있는 서버인가. 마이그레이션 적용 여부 확인용. */
export async function deviceFeatureAvailable(): Promise<boolean> {
  const { error } = await client().rpc('device_me', { p_device_id: deviceId() })
  if (!error) return true
  return !isMissingFunction(error)
}

/** 이 기기가 무엇으로 등록돼 있는지. 등록 전이면 null. */
export async function myDeviceRole(): Promise<DeviceRole | null> {
  const { data, error } = await client().rpc('device_me', { p_device_id: deviceId() })
  if (error) return null

  const row = (data as { kind: string; label: string | null; child_id: string | null }[])?.[0]
  if (!row) return null

  if (row.kind === 'parent' && (row.label === '엄마' || row.label === '아빠')) {
    return { kind: 'parent', label: row.label }
  }
  if (row.kind === 'child' && row.child_id) {
    return { kind: 'child', childId: row.child_id }
  }
  return null
}

/** 이 가족에서 아직 고를 수 있는 것들 */
export async function openSlots(): Promise<OpenSlot[]> {
  const { data, error } = await client().rpc('family_open_slots')
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as {
    kind: string
    label: string | null
    child_id: string | null
    child_name: string | null
  }[]

  return rows
    .map<OpenSlot | null>((r) => {
      if (r.kind === 'parent' && (r.label === '엄마' || r.label === '아빠')) {
        return { kind: 'parent', label: r.label }
      }
      if (r.kind === 'child' && r.child_id) {
        return { kind: 'child', childId: r.child_id, childName: r.child_name ?? '아이' }
      }
      return null
    })
    .filter((s): s is OpenSlot => s !== null)
}

/** 이 기기를 등록한다. 이름표가 이미 쓰이고 있으면 서버가 거부한다. */
export async function claimDevice(role: DeviceRole): Promise<void> {
  const { error } = await client().rpc('claim_device', {
    p_device_id: deviceId(),
    p_kind: role.kind,
    p_label: role.kind === 'parent' ? role.label : null,
    p_child_id: role.kind === 'child' ? role.childId : null,
  })
  if (error) throw new Error(error.message)
}

export async function releaseDevice(): Promise<void> {
  const { error } = await client().rpc('release_device', { p_device_id: deviceId() })
  if (error && !isMissingFunction(error)) throw new Error(error.message)
  forgetDeviceId()
}

export type RegisteredDevice = {
  id: string
  kind: 'parent' | 'child'
  label: string | null
  childId: string | null
  lastSeen: string | null
  /** 지금 보고 있는 이 핸드폰인가 */
  isMe: boolean
}

/**
 * 이 가족에 등록된 핸드폰 목록.
 *
 * 기기 id 는 브라우저 저장소에 있다. 앱을 지웠다 깔거나 저장소를 비우면 새 id 가
 * 생기고, 예전 행은 이름표를 쥔 채 남는다. 그런 유령이 둘 쌓이면 엄마·아빠가 모두
 * 막혀 새 핸드폰을 못 붙인다. 목록으로 보여주고 지울 수 있어야 한다.
 */
export async function familyDevices(): Promise<RegisteredDevice[]> {
  const me = deviceId()
  const { data, error } = await client()
    .from('device')
    .select('id, kind, label, child_id, last_seen')
    .order('last_seen', { ascending: false })

  if (error) {
    // 0009 미적용 서버에는 표 자체가 없다. 빈 목록으로 조용히 넘어간다.
    if (/does not exist|PGRST205/i.test(`${error.code} ${error.message}`)) return []
    throw new Error(error.message)
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: (r.kind as 'parent' | 'child') ?? 'parent',
    label: (r.label as string | null) ?? null,
    childId: (r.child_id as string | null) ?? null,
    lastSeen: (r.last_seen as string | null) ?? null,
    isMe: r.id === me,
  }))
}

/** 다른 핸드폰의 등록을 푼다 (유령 정리). 기록은 지워지지 않는다. */
export async function releaseDeviceById(id: string): Promise<void> {
  const { error } = await client().rpc('release_device', { p_device_id: id })
  if (error && !isMissingFunction(error)) throw new Error(error.message)
  if (id === deviceId()) forgetDeviceId()
}
