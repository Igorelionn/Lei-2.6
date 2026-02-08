import { createRoot } from 'react-dom/client'
import { Component, ReactNode, ErrorInfo } from 'react'
import App from './App.tsx'
import './index.css'

// Error boundary silencioso — recarrega a página em vez de mostrar tela de erro
class SilentErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      // Recarrega automaticamente após 1s em vez de mostrar tela de erro
      setTimeout(() => window.location.reload(), 1000);
      return null;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <SilentErrorBoundary>
    <App />
  </SilentErrorBoundary>
);
