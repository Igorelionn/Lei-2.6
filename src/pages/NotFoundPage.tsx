import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col selection:bg-gray-900 selection:text-white">

      {/* Conteúdo principal */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-lg w-full">

          <div className="space-y-10">

            {/* Logo — âncora visual principal */}
            <img
              src="/arthur-lira-logo.png"
              alt="Arthur Lira Leilões"
              className="h-14 sm:h-16 w-auto object-contain"
            />

            {/* Código do erro */}
            <div className="space-y-4">
              <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-gray-900">
                Erro 404
              </span>
              <h1 className="text-3xl sm:text-[2.5rem] font-light text-gray-900 leading-tight tracking-tight">
                Página não encontrada
              </h1>
            </div>

            {/* Descrição */}
            <p className="text-[15px] text-gray-500 leading-relaxed max-w-sm">
              O recurso solicitado não está disponível neste endereço.
              Verifique a URL ou retorne ao painel de controle.
            </p>

            {/* CTA + copyright — agrupados como fechamento visual */}
            <div className="pt-2 space-y-10">
              <Link
                to="/"
                className="group inline-flex items-center gap-3 text-sm font-medium text-gray-400 hover:text-gray-900 transition-colors duration-300"
              >
                <span className="flex items-center justify-center w-10 h-10 rounded-full border border-gray-300 text-gray-400 group-hover:border-gray-900 group-hover:bg-gray-900 group-hover:text-white transition-all duration-300">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                </span>
                <span className="tracking-wide">Voltar ao Dashboard</span>
              </Link>

              <p className="text-[11px] text-gray-400 tracking-wide">
                &copy; {new Date().getFullYear()} Arthur Lira Leilões
              </p>
            </div>
          </div>

        </div>
      </main>

    </div>
  );
}