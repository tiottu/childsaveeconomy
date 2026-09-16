import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 는 저장소 이름 아래에 깔린다.
// 이 값이 틀리면 화면이 하얗게만 뜨고 아무것도 안 보인다.
export default defineConfig({
  plugins: [react()],
  base: '/childsaveeconomy/',
})
