import { createRoot } from 'react-dom/client'

createRoot(document.getElementById('root')!).render(
  <div style={{ fontFamily: 'sans-serif', padding: 40, textAlign: 'center' }}>
    <h1>빌드 성공</h1>
    <p>GitHub 이 빌드해서 배포하는 길이 열렸습니다.</p>
  </div>,
)
