import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  Home,
  Gavel,
  Package,
  Users,
  FileText,
  AlertTriangle,
  BarChart3,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  UserPlus,
  Handshake,
  History,
  LucideIcon,
  X,
} from "lucide-react";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "./ui/button";
import { AnimatedIcon } from "./SidebarIcons";

type MenuItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  animKey: string; // chave para o AnimatedIcon
  subitems?: { icon: LucideIcon; label: string; path: string }[];
};

const menuItems: MenuItem[] = [
  { icon: Home, label: "Dashboard", path: "/", animKey: "home" },
  { icon: Gavel, label: "Leilões", path: "/leiloes", animKey: "gavel" },
  { 
    icon: Package, 
    label: "Lotes", 
    path: "/lotes",
    animKey: "package",
    subitems: [
      { icon: UserPlus, label: "Lotes Convidados", path: "/lotes-convidados" }
    ]
  },
  { icon: Handshake, label: "Patrocinadores", path: "/patrocinadores", animKey: "handshake" },
  { icon: Users, label: "Arrematantes", path: "/arrematantes", animKey: "users" },
  { icon: FileText, label: "Faturas", path: "/faturas", animKey: "filetext" },
  { icon: AlertTriangle, label: "Inadimplência", path: "/inadimplencia", animKey: "alert" },
  { icon: History, label: "Histórico", path: "/historico", animKey: "history" },
  { icon: BarChart3, label: "Relatórios", path: "/relatorios", animKey: "barchart" },
  { icon: Settings, label: "Configurações", path: "/configuracoes", animKey: "settings" },
];

/** Conteúdo compartilhado do sidebar (usado desktop e mobile) */
function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const location = useLocation();
  const { logout } = useAuth();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [clickedIcon, setClickedIcon] = useState<string | null>(null);

  const handleLinkClick = (path: string) => {
    // Disparar animação ao clicar
    setClickedIcon(path);
    setTimeout(() => setClickedIcon(null), 650);
    onNavigate?.();
  };

  return (
    <>
      <nav className="flex-1 p-3 xl:p-4 flex flex-col overflow-y-auto">
        <ul className="space-y-1 xl:space-y-2 flex-1">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            const hasSubitems = item.subitems && item.subitems.length > 0;
            const isHovered = hoveredItem === item.path;
            const isAnimating = clickedIcon === item.path;
            
            return (
              <li key={item.path}>
                <div
                  onMouseEnter={() => {
                    setIsExiting(false);
                    setHoveredItem(item.path);
                  }}
                  onMouseLeave={() => {
                    if (hasSubitems) {
                      setIsExiting(true);
                      setTimeout(() => {
                        setHoveredItem(null);
                        setIsExiting(false);
                      }, 250);
                    } else {
                      setHoveredItem(null);
                    }
                  }}
                >
                <Link
                  to={item.path}
                  onClick={() => handleLinkClick(item.path)}
                  className={cn(
                    "group flex items-center rounded-lg transition-colors",
                    collapsed ? "justify-center py-3 px-5 mx-0" : "space-x-3 px-3 py-2.5",
                    isActive
                      ? "bg-gray-100 text-black"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <AnimatedIcon
                    name={item.animKey}
                    isAnimating={isAnimating}
                    className="h-5 w-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                  />
                  {!collapsed && <span className="group-hover:translate-x-1 transition-transform duration-300 truncate">{item.label}</span>}
                </Link>

                  {/* Submenu */}
                  {hasSubitems && isHovered && !collapsed && (
                    <div className={cn(
                      "mt-1 space-y-1",
                      isExiting ? "submenu-fade-out" : "submenu-fade-in"
                    )}>
                      {item.subitems!.map((subitem) => {
                        const SubIcon = subitem.icon;
                        const isSubActive = location.pathname === subitem.path;
                        
                        return (
                          <Link
                            key={subitem.path}
                            to={subitem.path}
                            onClick={handleLinkClick}
                            className={cn(
                              "flex items-center space-x-2 px-3 py-2.5 pl-10 text-sm rounded-lg transition-all duration-300 ease-in-out",
                              isSubActive
                                ? "bg-gray-100 text-black"
                                : "text-muted-foreground hover:text-foreground hover:bg-gray-50"
                            )}
                          >
                            <SubIcon className="h-4 w-4 flex-shrink-0" />
                            <span className="transition-transform duration-300 ease-out hover:translate-x-0.5">{subitem.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        
        {/* Botão de Logout */}
        <div className="mt-4 pt-4 border-t border-border">
          <Button
            variant="ghost"
            onClick={logout}
            className={cn(
              "w-full flex items-center rounded-lg transition-colors text-muted-foreground hover:text-red-600 hover:bg-red-50",
              collapsed ? "justify-center py-3 px-5" : "justify-start space-x-3 px-3 py-2.5"
            )}
            title={collapsed ? "Sair" : undefined}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>Sair</span>}
          </Button>
        </div>
      </nav>
    </>
  );
}

/** Sidebar Desktop - fixo na lateral */
function DesktopSidebar() {
  const { isCollapsed, toggleSidebar } = useSidebar();

  return (
    <div className="relative flex-shrink-0 hidden md:block">
      <div className={cn(
        "bg-card border-r border-border h-screen flex flex-col transition-all duration-300 ease-in-out",
        isCollapsed ? "w-[72px]" : "w-60 xl:w-64"
      )}>
        <div className={cn(
          "border-b border-border flex items-center justify-center transition-all duration-300",
          isCollapsed ? "p-4 h-[72px]" : "p-5 xl:p-6"
        )}>
          {!isCollapsed && (
            <img 
              src="/arthur-lira-logo.png" 
              alt="Arthur Lira Leilões" 
              className="h-14 xl:h-16 w-auto object-contain"
            />
          )}
          {isCollapsed && (
            <img 
              src="/arthur-lira-logo.png" 
              alt="Arthur Lira Leilões" 
              className="h-8 w-8 object-contain rounded"
            />
          )}
        </div>
        
        {/* Botão toggle posicionado na borda direita */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className={cn(
            "group absolute -right-4 top-[280px] z-10 h-8 w-8 rounded-full bg-card border border-border shadow-md",
            "hover:bg-primary/10 hover:border-primary/30 transition-colors duration-200",
            "flex items-center justify-center"
          )}
        >
          {isCollapsed ? (
            <ChevronsRight className="h-4 w-4 text-foreground/70" />
          ) : (
            <ChevronsLeft className="h-4 w-4 text-foreground/70" />
          )}
        </Button>
        
        <SidebarContent collapsed={isCollapsed} />
      </div>
    </div>
  );
}

/** Sidebar Mobile - drawer overlay */
function MobileSidebar() {
  const { isMobileOpen, closeMobile } = useSidebar();

  return (
    <>
      {/* Overlay escuro */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 md:hidden animate-in fade-in duration-200"
          onClick={closeMobile}
        />
      )}

      {/* Drawer lateral */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-[85vw] max-w-72 bg-card border-r border-border flex flex-col shadow-xl md:hidden",
        "transition-transform duration-300 ease-in-out",
        isMobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Header do drawer */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <img 
            src="/arthur-lira-logo.png" 
            alt="Arthur Lira Leilões" 
            className="h-10 w-auto object-contain"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={closeMobile}
            className="h-10 w-10 p-0 hover:bg-gray-100 no-min-touch"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <SidebarContent collapsed={false} onNavigate={closeMobile} />
      </div>
    </>
  );
}

/** Sidebar principal - combina desktop e mobile */
export function Sidebar() {
  return (
    <>
      <DesktopSidebar />
      <MobileSidebar />
    </>
  );
}
