import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

try {
  createRoot(document.getElementById("root")!).render(<App />);
} catch (e) {
  // Se React falhar ao montar, mostrar erro visível (ajuda debug em iPhone)
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = '<div style="padding:24px;font-family:system-ui;color:#111"><h2>Erro ao carregar</h2><p style="color:#666;font-size:14px">' + (e instanceof Error ? e.message : String(e)) + '</p><button onclick="location.reload()" style="margin-top:16px;padding:8px 20px;background:#3b82f6;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer">Tentar Novamente</button></div>';
  }
}
