import { Sidebar } from "./Sidebar";
import { SidebarProvider, useSidebar } from "@/hooks/use-sidebar";
import { Menu } from "lucide-react";
import { Button } from "./ui/button";

interface LayoutProps {
  children: React.ReactNode;
}

function MobileHeader() {
  const { isMobile, openMobile } = useSidebar();

  if (!isMobile) return null;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between bg-card border-b border-border px-4 py-3 md:hidden">
      <Button
        variant="ghost"
        size="sm"
        onClick={openMobile}
        className="h-10 w-10 p-0 no-min-touch"
      >
        <Menu className="h-6 w-6" />
        <span className="sr-only">Menu</span>
      </Button>
      <img 
        src="/arthur-lira-logo.png" 
        alt="Arthur Lira Leilões" 
        className="h-8 w-auto object-contain"
      />
      <div className="w-9" /> {/* Espaçador para centralizar a logo */}
    </header>
  );
}

function LayoutContent({ children }: LayoutProps) {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader />
        <main className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6 xl:p-8">
          <div className="max-w-[1800px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function Layout({ children }: LayoutProps) {
  return (
    <SidebarProvider>
      <LayoutContent>{children}</LayoutContent>
    </SidebarProvider>
  );
}
