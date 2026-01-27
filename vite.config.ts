import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // ⚡ PERFORMANCE: Otimizações de build
  build: {
    // Aumentar aviso de tamanho de chunk para 1MB (padrão é 500KB)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // ⚡ PERFORMANCE: Code splitting manual para melhor cacheamento
        manualChunks: {
          // Vendor chunks separados por biblioteca
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-toast',
            '@radix-ui/react-tabs',
            '@radix-ui/react-accordion',
            '@radix-ui/react-alert-dialog',
          ],
          'supabase': ['@supabase/supabase-js'],
          'query': ['@tanstack/react-query'],
          'charts': ['recharts'],
          'icons': ['lucide-react'],
          'pdf': ['jspdf', 'html2canvas', 'html2pdf.js'],
          'excel': ['xlsx', 'docx'],
        },
      },
    },
  },
}));
