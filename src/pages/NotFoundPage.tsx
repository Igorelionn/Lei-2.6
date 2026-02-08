import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header minimalista */}
      <header className="w-full px-6 sm:px-10 py-6">
        <img
          src="/arthur-lira-logo.png"
          alt="Arthur Lira Leilões"
          className="h-8 sm:h-10 w-auto object-contain"
        />
      </header>

      {/* Conteúdo centralizado */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          {/* Número 404 estilizado */}
          <div className="relative mb-8">
            <span className="text-[10rem] sm:text-[12rem] font-extralight leading-none tracking-tighter text-gray-100 select-none">
              404
            </span>
          </div>

          {/* Texto */}
          <div className="space-y-3 mb-10 -mt-6">
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight">
              Página não encontrada
            </h1>
            <p className="text-sm sm:text-base text-gray-500 leading-relaxed">
              O endereço acessado não corresponde a nenhuma página do sistema.
              <br className="hidden sm:block" />
              Verifique o link ou retorne ao painel principal.
            </p>
          </div>

          {/* Botão de retorno */}
          <Button
            asChild
            variant="outline"
            className="h-11 px-6 rounded-lg border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 transition-all duration-200 shadow-sm"
          >
            <Link to="/" className="gap-2.5 inline-flex items-center">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Dashboard
            </Link>
          </Button>
        </div>
      </main>

      {/* Footer discreto */}
      <footer className="w-full px-6 sm:px-10 py-6 text-center">
        <p className="text-xs text-gray-400">
          Arthur Lira Leiloes &mdash; Sistema de Gestao
        </p>
      </footer>
    </div>
  );
}