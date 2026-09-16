import { supabase } from './supabaseClient'

/**
 * 기기를 가족에 붙이는 일을 담당한다.
 *
 * 아이에게 이메일 계정을 만들라고 할 수 없으므로 익명 로그인을 쓴다.
 * 익명 계정은 이 기기에만 남는 영구 계정처럼 동작한다 — 기기를 바꾸면 다시 붙여야 한다.
 *
 * 새로 로그인한 기기는 member 행이 없고, RLS 는 member 행이 없는 사용자에게
 * 아무것도 보여주지 않는다. 그래서 가입은 SECURITY DEFINER 함수(0002_auth.sql)로만 한다.
 */

export type Membership = {
  userId: string
  familyId: string
  role: 'parent' | 'child'
  childId: string | null
  /** 부모 기기의 이름표. 엄마 / 아빠. 권한 차이는 없다. */
  label: ParentLabel | null
  /** 이메일 계정인가 (부모) */
  email: string | null
}

export type ParentLabel = '엄마' | '아빠'

export type ChildOption = {
  id: string
  name: string
  birth_year: number | null
}

function client() {
  const sb = supabase()
  if (!sb) throw new Error('Supabase 설정이 없습니다')
  return sb
}

/**
 * 세션 확보.
 *
 * 부모는 이메일 + PIN 으로 로그인하므로 여기서 계정을 만들지 않는다.
 * 아이 기기만 익명 계정이 필요하고, 그건 초대 코드를 넣는 시점에 만든다.
 * 세션이 없으면 null 을 돌려주고 앱은 "부모 / 아이" 선택 화면을 띄운다.
 */
export async function currentUserId(): Promise<string | null> {
  const sb = client()
  const { data } = await sb.auth.getSession()
  return data.session?.user.id ?? null
}

/** 아이 기기용 익명 계정. 초대 코드를 넣기 직전에 부른다. */
export async function ensureAnonymousSession(): Promise<string> {
  const sb = client()

  const { data: existing } = await sb.auth.getSession()
  if (existing.session?.user.id) return existing.session.user.id

  const { data, error } = await sb.auth.signInAnonymously()
  if (error) {
    // 대시보드에서 익명 로그인을 켜지 않으면 여기서 막힌다
    if (error.message.includes('Anonymous sign-ins are disabled')) {
      throw new Error('Supabase 대시보드에서 익명 로그인(Anonymous sign-ins)을 켜 주세요')
    }
    throw new Error(error.message)
  }
  if (!data.user) throw new Error('로그인에 실패했습니다')
  return data.user.id
}

/**
 * 부모 계정: 이메일 + PIN 6자리.
 *
 * 메일로 코드를 받는 방식을 대신한다. 메일 템플릿 설정에 의존하지 않고, 기기를
 * 추가할 때마다 메일함을 여는 일도 없앤다.
 *
 * **이메일 자체는 검증하지 않는다.** 그래서 이메일은 비밀이 아니라 "어느 집인지"를
 * 가리키는 이름표일 뿐이고, 진짜 비밀은 PIN 이다. PIN 없이 이메일만으로는 아무것도
 * 못 한다 — Supabase 가 비밀번호를 검사하고, 틀린 시도에는 속도 제한을 건다.
 *
 * 처음 쓰는 이메일이면 계정을 만들고, 이미 있으면 로그인한다. 사용자에게는 구분이
 * 없어야 한다 — 두 번째 기기에서도 똑같이 이메일과 PIN 만 넣으면 된다.
 *
 * 반환값 isNew 는 "방금 계정을 만들었다" 는 뜻이다. 화면이 가족 만들기로 갈지
 * 기존 가족으로 갈지 정하는 데 쓴다.
 */
export async function signInParent(
  email: string,
  pin: string,
): Promise<{ isNew: boolean }> {
  const sb = client()
  const addr = email.trim().toLowerCase()

  // 익명 세션이 남아 있으면 비켜준다. 남겨두면 익명 토큰으로 계속 돌아 부모가 못 된다.
  const { data: existing } = await sb.auth.getSession()
  if (existing.session?.user.is_anonymous) await sb.auth.signOut()

  // 이미 있는 계정이 흔한 경우다 (두 번째 기기, 재설치). 로그인을 먼저 해본다.
  const signIn = await sb.auth.signInWithPassword({ email: addr, password: pin })
  if (!signIn.error) return { isNew: false }

  // 로그인 실패가 "없는 계정" 때문인지 "틀린 PIN" 때문인지 Supabase 는 알려주지 않는다
  // (계정 존재 여부를 흘리지 않으려는 의도다). 가입을 시도해 보면 구분이 된다.
  const signUp = await sb.auth.signUp({ email: addr, password: pin })

  // "Confirm email" 이 켜져 있으면 가입할 때 확인 메일을 보내려 한다. 이 앱은 그 메일을
  // 쓰지 않기로 했으니(그게 이 방식으로 바꾼 이유다) 설정을 꺼야 한다. 메일 발송이
  // 막혀서 나는 rate limit 오류도 결국 같은 원인이라 같은 안내를 준다.
  const CONFIRM_EMAIL_HINT =
    'Supabase 대시보드 → Authentication → Sign In / Providers → Email 에서 "Confirm email" 을 꺼 주세요. 이 앱은 확인 메일을 쓰지 않습니다.'

  if (signUp.error) {
    const m = signUp.error.message
    if (/already registered|already exists/i.test(m)) {
      // 계정은 있는데 위에서 로그인이 안 됐다. 이유가 둘인데 서버가 구분해 주지 않는다.
      //  - PIN 을 잘못 넣었다
      //  - 그 이메일 계정에 애초에 비밀번호가 없다 (예전 메일 인증 방식으로 만든 계정)
      // 두 번째를 "PIN 이 틀렸다" 고만 말하면, 맞는 PIN 을 넣어도 계속 틀렸다고 나와서
      // 사용자가 빠져나올 수가 없다. 실제로 그 일이 있었다.
      throw new Error(
        '이미 등록된 이메일입니다. PIN 이 다르거나, 예전에 메일 인증으로 만든 계정일 수 있습니다. 다른 이메일로 등록해 보세요.',
      )
    }
    if (/rate limit/i.test(m)) throw new Error(CONFIRM_EMAIL_HINT)
    if (/password/i.test(m) && /short|least|weak/i.test(m)) {
      throw new Error(
        '이 프로젝트는 더 긴 비밀번호를 요구합니다. Supabase 대시보드 → Authentication → Sign In / Providers 에서 최소 길이를 6으로 낮춰 주세요',
      )
    }
    throw new Error(m)
  }

  // 가입은 됐는데 세션이 없다 = 확인 메일을 기다리는 상태다
  if (!signUp.data.session) throw new Error(CONFIRM_EMAIL_HINT)

  return { isNew: true }
}

/** 부모 계정 비밀번호(= PIN) 변경. 설정에서 PIN 을 바꿀 때 같이 맞춘다. */
export async function updateParentPassword(pin: string): Promise<void> {
  const sb = client()
  const { data } = await sb.auth.getSession()
  // 익명 계정(아이 기기)에는 비밀번호가 없다. 조용히 넘어간다.
  if (!data.session || data.session.user.is_anonymous) return

  const { error } = await sb.auth.updateUser({ password: pin })
  if (error) throw new Error(error.message)
}

/** 이 기기가 이메일 계정으로 로그인돼 있는지 (부모). 익명 계정(아이)은 null. */
export async function signedInEmail(): Promise<string | null> {
  const sb = client()
  const { data } = await sb.auth.getSession()
  const user = data.session?.user
  if (!user || user.is_anonymous) return null
  return user.email ?? null
}

/** 가족을 새로 만든다. 첫 부모가 부른다. 가족 코드는 서버가 생성한다. */
export async function createFamily(
  name: string,
  label: ParentLabel,
): Promise<{ familyId: string; inviteCode: string }> {
  const { data, error } = await client().rpc('create_family', {
    p_name: name,
    p_label: label,
  })
  if (error) throw new Error(error.message)
  const row = (data as { family_id: string; invite_code: string }[])?.[0]
  if (!row) throw new Error('가족을 만들지 못했습니다')
  return { familyId: row.family_id, inviteCode: row.invite_code }
}

/** 배우자가 기존 가족에 합류한다. */
export async function joinFamilyAsParent(code: string, label: ParentLabel): Promise<void> {
  const { error } = await client().rpc('join_family_as_parent', {
    p_invite_code: code,
    p_label: label,
  })
  if (error) throw new Error(error.message)
}

/** 엄마 / 아빠 이름표 변경 */
export async function setMyLabel(label: ParentLabel): Promise<void> {
  const { error } = await client().rpc('set_my_label', { p_label: label })
  if (error) throw new Error(error.message)
}

/** 부모 PIN 이 설정돼 있는지. 없으면 잠금 화면을 띄우지 않는다. */
export async function parentPinIsSet(): Promise<boolean> {
  const { data, error } = await client().rpc('parent_pin_is_set')
  if (error) return false
  return Boolean(data)
}

/** 부모 PIN 잠금 해제(사용 중지) */
export async function clearParentPin(): Promise<void> {
  const { error } = await client().rpc('clear_parent_pin')
  if (error) throw new Error(error.message)
}

/** 이 기기가 어느 가족의 누구인지. 아직 안 붙었으면 null. */
export async function getMembership(): Promise<Membership | null> {
  const sb = client()

  const { data: session } = await sb.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) return null

  // member 의 select 정책은 본인 행을 허용한다
  const { data, error } = await sb
    .from('member')
    .select('user_id, family_id, role, child_id, label')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const user = session.session?.user
  return {
    userId: data.user_id as string,
    familyId: data.family_id as string,
    role: data.role as 'parent' | 'child',
    childId: (data.child_id as string | null) ?? null,
    label: (data.label as ParentLabel | null) ?? null,
    email: user && !user.is_anonymous ? (user.email ?? null) : null,
  }
}

/**
 * 가족 코드가 실제로 있는지.
 * 이 확인이 없으면 틀린 코드로도 다음 화면으로 넘어가고, 가입 버튼에서야 거부된다.
 */
export async function familyExists(code: string): Promise<boolean> {
  const { data, error } = await client().rpc('family_exists', {
    p_invite_code: code,
  })

  if (error) {
    // 0005 마이그레이션이 아직 안 올라간 서버에서는 이 함수가 없다.
    // 확인을 못 한다고 가입 자체를 막을 이유는 없다 — 가입 함수가 코드를 다시 검증한다.
    if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message)) {
      return true
    }
    throw new Error(error.message)
  }
  return Boolean(data)
}

/** 가족 코드로 아이 목록을 먼저 본다. 이름만 준다 — 금액은 가입 후에야 보인다. */
export async function familyChildren(code: string): Promise<ChildOption[]> {
  const { data, error } = await client().rpc('family_children', {
    p_invite_code: code,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as ChildOption[]
}

/** 이 가족에 부모가 이미 등록돼 있는지. 첫 부모는 PIN 을 새로 정한다. */
export async function familyHasParent(code: string): Promise<boolean> {
  const { data, error } = await client().rpc('family_has_parent', {
    p_invite_code: code,
  })
  if (error) throw new Error(error.message)
  return Boolean(data)
}

export async function joinAsParent(code: string, pin: string): Promise<void> {
  const { error } = await client().rpc('join_as_parent', {
    p_invite_code: code,
    p_pin: pin,
  })
  if (error) throw new Error(error.message)
}

export async function joinAsChild(code: string, childId: string): Promise<void> {
  const { error } = await client().rpc('join_as_child', {
    p_invite_code: code,
    p_child_id: childId,
  })
  if (error) throw new Error(error.message)
}

export async function joinAsNewChild(
  code: string,
  input: { name: string; birth_year: number | null; weekly_allowance: number; payday: number },
): Promise<void> {
  const { error } = await client().rpc('join_as_new_child', {
    p_invite_code: code,
    p_name: input.name,
    p_birth_year: input.birth_year,
    p_weekly_allowance: input.weekly_allowance,
    p_payday: input.payday,
  })
  if (error) throw new Error(error.message)
}

/**
 * 우리 가족의 가족 코드. 아이 핸드폰을 붙일 때 알려줘야 하는 값이라 앱에서 보여준다.
 * family 의 select 정책이 우리 가족 행만 내주므로 그대로 읽으면 된다.
 */
export async function getFamilyCode(): Promise<string | null> {
  const { data, error } = await client()
    .from('family')
    .select('invite_code')
    .maybeSingle()
  if (error) return null
  return (data?.invite_code as string | undefined) ?? null
}

/** 가족 코드 변경. 부모만 가능하고 형식·중복은 서버가 검사한다. */
export async function setFamilyCode(code: string): Promise<string> {
  const { data, error } = await client().rpc('set_family_code', { p_code: code })
  if (error) {
    if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message)) {
      throw new Error('가족 코드 변경 기능이 아직 서버에 올라가지 않았습니다 (마이그레이션 0006)')
    }
    throw new Error(error.message)
  }
  return String(data)
}

/** 부모 모드 잠금 해제. PIN 해시는 서버에만 있고 기기에 저장하지 않는다. */
export async function verifyParentPin(pin: string): Promise<boolean> {
  const { data, error } = await client().rpc('verify_parent_pin', { p_pin: pin })
  if (error) throw new Error(error.message)
  return Boolean(data)
}

export async function setParentPin(pin: string): Promise<void> {
  const { error } = await client().rpc('set_parent_pin', { p_pin: pin })
  if (error) throw new Error(error.message)
}

/**
 * 이 기기의 가족 등록을 지우고 다시 가족 코드부터 시작한다.
 * member 쓰기는 부모 권한이라 아이 기기가 자기 행을 못 지운다. 그래서 전용 함수를 쓴다.
 */
export async function leaveFamily(): Promise<void> {
  const sb = client()
  const { error } = await sb.rpc('leave_family')

  // 등록 해제가 실패해도 로그아웃은 해서 이 기기에서는 접근이 끊기게 한다.
  // 다음에 앱을 열면 새 익명 계정이 생기므로 예전 member 행은 쓰이지 않는다.
  await sb.auth.signOut()

  if (error) {
    // 0003 마이그레이션이 아직 안 올라간 서버에는 이 함수가 없다.
    // 로그아웃은 이미 됐으니 사용자에게 오류를 보여줄 이유가 없다.
    if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message)) {
      return
    }
    throw new Error(error.message)
  }
}
