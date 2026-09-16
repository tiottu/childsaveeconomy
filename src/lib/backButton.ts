import { useEffect, useRef } from 'react'

/**
 * 핸드폰 뒤로 버튼을 앱의 "이전 화면" 으로 쓴다.
 *
 * 이 앱은 주소가 하나고 화면은 상태로만 바뀐다. 그래서 브라우저 이력에 돌아갈 칸이
 * 없고, 뒤로 버튼을 누르면 이전 화면이 아니라 **창이 닫힌다.** 핸드폰에서 이건
 * 사고처럼 느껴진다 — 기록하다 실수로 누르면 앱이 사라진다.
 *
 * 그래서 첫 화면이 아닐 때만 이력에 칸 하나를 만들어 둔다. 뒤로 버튼이 그 칸을
 * 먼저 소비하면서 popstate 가 오고, 우리가 이전 화면으로 옮긴다. 첫 화면에서는
 * 칸이 없으니 원래대로 앱을 나간다 — 그게 맞는 동작이다.
 *
 * 칸은 **깊이와 무관하게 언제나 하나만** 유지한다. 한 단계 물러난 뒤에도 여전히
 * 첫 화면이 아니면 다시 하나를 만든다. 깊이만큼 쌓아두면 화면 이동 경로와
 * 이력이 어긋나기 쉬운데, 이 방식은 어긋날 구석이 없다.
 *
 * @param offRoot 지금 첫 화면이 아닌가 (뒤로 갈 곳이 있는가)
 * @param onBack  뒤로 버튼을 눌렀을 때 한 단계 물러나는 함수
 */
export function useBackButton(offRoot: boolean, onBack: () => void): void {
  const trapped = useRef(false)
  /** 우리가 스스로 history.back() 을 불렀을 때 오는 popstate 는 무시해야 한다 */
  const selfInflicted = useRef(false)
  const handler = useRef(onBack)
  handler.current = onBack

  useEffect(() => {
    const onPop = () => {
      trapped.current = false
      if (selfInflicted.current) {
        selfInflicted.current = false
        return
      }
      handler.current()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (offRoot && !trapped.current) {
      history.pushState({ backTrap: true }, '')
      trapped.current = true
      return
    }
    // 앱 안의 ‹ 버튼이나 저장 완료로 첫 화면에 돌아왔다. 우리가 만든 칸을 돌려준다.
    // 안 돌려주면 다음 뒤로 버튼 한 번이 아무 일도 안 하는 것처럼 헛돈다.
    if (!offRoot && trapped.current) {
      selfInflicted.current = true
      trapped.current = false
      history.back()
    }
  }, [offRoot])
}
