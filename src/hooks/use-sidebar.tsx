import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

const MOBILE_BREAKPOINT = 768; // md breakpoint
const COLLAPSE_BREAKPOINT = 1280; // xl breakpoint

interface SidebarContextType {
  isCollapsed: boolean;
  isMobile: boolean;
  isMobileOpen: boolean;
  toggleSidebar: () => void;
  openMobile: () => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < MOBILE_BREAKPOINT;
    }
    return false;
  });

  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Iniciar colapsado em telas menores que xl (1280px) e maiores que mobile
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < COLLAPSE_BREAKPOINT;
    }
    return false;
  });

  // Reagir a mudanças de tamanho de tela
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const nowMobile = window.innerWidth < MOBILE_BREAKPOINT;
        const isSmallDesktop = window.innerWidth < COLLAPSE_BREAKPOINT;

        setIsMobile(nowMobile);

        // Fechar drawer mobile se expandiu para desktop
        if (!nowMobile) {
          setIsMobileOpen(false);
        }

        // Auto-colapsar sidebar no desktop se a tela ficou menor
        setIsCollapsed(prev => {
          if (!nowMobile && isSmallDesktop && !prev) return true;
          return prev;
        });
      }, 150);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setIsMobileOpen(prev => !prev);
    } else {
      setIsCollapsed(prev => !prev);
    }
  }, [isMobile]);

  const openMobile = useCallback(() => setIsMobileOpen(true), []);
  const closeMobile = useCallback(() => setIsMobileOpen(false), []);

  return (
    <SidebarContext.Provider value={{ isCollapsed, isMobile, isMobileOpen, toggleSidebar, openMobile, closeMobile }}>
      {children}
    </SidebarContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar deve ser usado dentro de SidebarProvider");
  }
  return context;
}
// Nota: Provider e hook são exportados juntos intencionalmente (padrão React Context)
