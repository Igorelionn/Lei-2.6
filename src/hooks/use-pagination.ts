import { useState, useMemo } from 'react';

/**
 * Hook customizado para gerenciar paginação
 * 
 * @param totalItems - Total de itens
 * @param itemsPerPage - Itens por página (padrão: 50)
 * @returns Objeto com estado e funções de paginação
 * 
 * @example
 * const { currentPage, totalPages, setPage, nextPage, prevPage } = usePagination(totalItems, 50);
 */
export function usePagination(totalItems: number, itemsPerPage: number = 50) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalItems / itemsPerPage));
  }, [totalItems, itemsPerPage]);

  const offset = useMemo(() => {
    return (currentPage - 1) * itemsPerPage;
  }, [currentPage, itemsPerPage]);

  const setPage = (page: number) => {
    const validPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(validPage);
  };

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const goToFirstPage = () => {
    setCurrentPage(1);
  };

  const goToLastPage = () => {
    setCurrentPage(totalPages);
  };

  const hasNextPage = currentPage < totalPages;
  const hasPrevPage = currentPage > 1;

  return {
    currentPage,
    totalPages,
    offset,
    itemsPerPage,
    setPage,
    nextPage,
    prevPage,
    goToFirstPage,
    goToLastPage,
    hasNextPage,
    hasPrevPage,
  };
}

/**
 * Hook para paginação client-side (para dados já carregados)
 */
export function useClientPagination<T>(items: T[], itemsPerPage: number = 50) {
  const pagination = usePagination(items.length, itemsPerPage);

  const paginatedItems = useMemo(() => {
    const start = pagination.offset;
    const end = start + itemsPerPage;
    return items.slice(start, end);
  }, [items, pagination.offset, itemsPerPage]);

  return {
    ...pagination,
    items: paginatedItems,
  };
}
