import { cn } from "@/lib/utils";

interface AnimatedIconProps {
  name: string;
  isAnimating: boolean;
  className?: string;
}

/**
 * SVGs customizados com partes internas separadas para animação.
 * Cada ícone tem elementos individuais (paths, rects, circles) que
 * podem ser animados via CSS quando isAnimating é true.
 */
export function AnimatedIcon({ name, isAnimating, className }: AnimatedIconProps) {
  const animClass = isAnimating ? `sidebar-active-${name}` : "";

  const svgProps = {
    xmlns: "http://www.w3.org/2000/svg",
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: cn(className, animClass),
  };

  switch (name) {
    // ─── Dashboard (Home) ─── telhado + corpo + porta
    case "home":
      return (
        <svg {...svgProps}>
          {/* Telhado */}
          <path className="icon-roof" d="M3 9l9-7 9 7" />
          {/* Corpo da casa */}
          <path className="icon-body" d="M9 22V12h6v10" />
          <path className="icon-walls" d="M21 9v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9" />
        </svg>
      );

    // ─── Leilões (Gavel) ─── martelo + base
    case "gavel":
      return (
        <svg {...svgProps}>
          {/* Martelo (cabeça + cabo) */}
          <g className="icon-hammer">
            <path d="M14.5 3.5l5 5" />
            <path d="M11.5 6.5l5 5" />
            <path d="M14 4l-8.5 8.5a2.12 2.12 0 0 0 3 3L17 7" />
          </g>
          {/* Base */}
          <path className="icon-base" d="M6 18h8" />
          <path className="icon-base" d="M10 18v-4" />
        </svg>
      );

    // ─── Lotes (Package) ─── tampa + corpo da caixa
    case "package":
      return (
        <svg {...svgProps}>
          {/* Tampa da caixa */}
          <g className="icon-lid">
            <path d="M16.5 9.4l-9-5.19" />
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </g>
          {/* Linhas internas */}
          <polyline className="icon-stripe-v" points="3.27 6.96 12 12.01 20.73 6.96" />
          <line className="icon-stripe-h" x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );

    // ─── Patrocinadores (Handshake) ─── mão esquerda + mão direita
    case "handshake":
      return (
        <svg {...svgProps}>
          <g className="icon-hand-left">
            <path d="M11 17a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h2" />
            <path d="M2 11l3.5-3.5" />
            <path d="M2 17l2-2" />
          </g>
          <g className="icon-hand-right">
            <path d="M13 17a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-2" />
            <path d="M22 11l-3.5-3.5" />
            <path d="M22 17l-2-2" />
          </g>
          {/* Aperto central */}
          <path className="icon-clasp" d="M8 14h8" />
          <path className="icon-clasp" d="M12 10v4" />
        </svg>
      );

    // ─── Arrematantes (Users) ─── pessoa 1 + pessoa 2
    case "users":
      return (
        <svg {...svgProps}>
          {/* Pessoa da frente */}
          <g className="icon-user-front">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </g>
          {/* Pessoa de trás */}
          <g className="icon-user-back">
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </g>
        </svg>
      );

    // ─── Faturas (FileText) ─── documento + linhas de texto
    case "filetext":
      return (
        <svg {...svgProps}>
          {/* Documento */}
          <path className="icon-doc" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline className="icon-doc-fold" points="14 2 14 8 20 8" />
          {/* Linhas de texto */}
          <line className="icon-line-1" x1="8" y1="13" x2="16" y2="13" />
          <line className="icon-line-2" x1="8" y1="17" x2="13" y2="17" />
        </svg>
      );

    // ─── Inadimplência (AlertTriangle) ─── triângulo + exclamação
    case "alert":
      return (
        <svg {...svgProps}>
          {/* Triângulo */}
          <path
            className="icon-triangle"
            d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
          />
          {/* Exclamação */}
          <line className="icon-excl-line" x1="12" y1="9" x2="12" y2="13" />
          <circle className="icon-excl-dot" cx="12" cy="17" r="0.5" fill="currentColor" />
        </svg>
      );

    // ─── Histórico (History) ─── corpo do relógio + ponteiro
    case "history":
      return (
        <svg {...svgProps}>
          {/* Corpo e seta de retorno */}
          <path className="icon-clock-body" d="M3 3v5h5" />
          <path
            className="icon-clock-arc"
            d="M3.05 13A9 9 0 1 0 6 5.3L3 8"
          />
          {/* Ponteiros */}
          <line className="icon-hand-hour" x1="12" y1="12" x2="12" y2="7" />
          <line className="icon-hand-minute" x1="12" y1="12" x2="16" y2="12" />
        </svg>
      );

    // ─── Relatórios (BarChart3) ─── 3 barras individuais
    case "barchart":
      return (
        <svg {...svgProps}>
          {/* Eixo horizontal */}
          <line className="icon-axis" x1="3" y1="21" x2="21" y2="21" />
          {/* Barra 1 (esquerda, baixa) */}
          <rect className="icon-bar-1" x="5" y="15" width="4" height="6" rx="1" fill="none" />
          {/* Barra 2 (meio, alta) */}
          <rect className="icon-bar-2" x="10" y="7" width="4" height="14" rx="1" fill="none" />
          {/* Barra 3 (direita, média) */}
          <rect className="icon-bar-3" x="15" y="11" width="4" height="10" rx="1" fill="none" />
        </svg>
      );

    // ─── Configurações (Settings) ─── engrenagem com dentes
    case "settings":
      return (
        <svg {...svgProps}>
          {/* Dentes da engrenagem */}
          <g className="icon-gear-teeth">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          </g>
          {/* Centro da engrenagem */}
          <circle className="icon-gear-center" cx="12" cy="12" r="3" />
        </svg>
      );

    // Fallback — ícone genérico
    default:
      return (
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
  }
}
