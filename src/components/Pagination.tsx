import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  showFirstLast?: boolean;
  disabled?: boolean;
}

/**
 * Componente de paginação reutilizável
 * 
 * @example
 * <Pagination
 *   currentPage={1}
 *   totalPages={10}
 *   onPageChange={(page) => setPage(page)}
 *   showFirstLast={true}
 * />
 */
export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  showFirstLast = false,
  disabled = false
}: PaginationProps) {
  const hasNextPage = currentPage < totalPages;
  const hasPrevPage = currentPage > 1;

  // Gerar números de página para exibir
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5; // Máximo de números visíveis

    if (totalPages <= maxVisible) {
      // Mostrar todas as páginas
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Lógica para muitas páginas
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  if (totalPages <= 1) {
    return null; // Não mostrar paginação se houver apenas 1 página
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1 mt-4">
      {/* Primeira Página - oculto em mobile */}
      {showFirstLast && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(1)}
          disabled={!hasPrevPage || disabled}
          title="Primeira página"
          className="h-10 w-10 sm:h-9 sm:w-9 no-min-touch"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
      )}

      {/* Página Anterior */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!hasPrevPage || disabled}
        title="Página anterior"
        className="h-10 w-10 sm:h-9 sm:w-9 no-min-touch"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {/* Números das Páginas */}
      {pageNumbers.map((pageNum, index) => {
        if (pageNum === '...') {
          return (
            <span
              key={`ellipsis-${index}`}
              className="px-1 sm:px-2 text-muted-foreground text-sm"
            >
              ...
            </span>
          );
        }

        const isActive = pageNum === currentPage;

        return (
          <Button
            key={pageNum}
            variant={isActive ? "default" : "outline"}
            size="icon"
            onClick={() => onPageChange(pageNum as number)}
            disabled={disabled}
            className="h-10 w-10 sm:h-9 sm:w-9 text-sm no-min-touch"
          >
            {pageNum}
          </Button>
        );
      })}

      {/* Próxima Página */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!hasNextPage || disabled}
        title="Próxima página"
        className="h-10 w-10 sm:h-9 sm:w-9 no-min-touch"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {/* Última Página - oculto em mobile */}
      {showFirstLast && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(totalPages)}
          disabled={!hasNextPage || disabled}
          title="Última página"
          className="h-10 w-10 sm:h-9 sm:w-9 no-min-touch"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      )}

      {/* Info de Página */}
      <span className="ml-1 sm:ml-2 text-xs sm:text-sm text-muted-foreground">
        {currentPage}/{totalPages}
      </span>
    </div>
  );
}

/**
 * Componente simplificado de paginação (apenas anterior/próximo)
 */
export function SimplePagination({
  currentPage,
  totalPages,
  onPageChange,
  disabled = false
}: PaginationProps) {
  const hasNextPage = currentPage < totalPages;
  const hasPrevPage = currentPage > 1;

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-between mt-4">
      <Button
        variant="outline"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={!hasPrevPage || disabled}
      >
        <ChevronLeft className="h-4 w-4 mr-2" />
        Anterior
      </Button>

      <span className="text-sm text-muted-foreground">
        Página {currentPage} de {totalPages}
      </span>

      <Button
        variant="outline"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!hasNextPage || disabled}
      >
        Próxima
        <ChevronRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
}
