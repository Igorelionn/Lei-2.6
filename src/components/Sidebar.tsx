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

type MenuItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  subitems?: { icon: LucideIcon; label: string; path: string }[];
};

const menuItems: MenuItem[] = [
  { icon: Home, label: "Dashboard", path: "/" },
  { icon: Gavel, label: "Leilões", path: "/leiloes" },
  { 
    icon: Package, 
    label: "Lotes", 
    path: "/lotes",
    subitems: [
      { icon: UserPlus, label: "Lotes Convidados", path: "/lotes-convidados" }
    ]
  },
  { icon: Handshake, label: "Patrocinadores", path: "/patrocinadores" },
  { icon: Users, label: "Arrematantes", path: "/arrematantes" },
  { icon: FileText, label: "Faturas", path: "/faturas" },
  { icon: AlertTriangle, label: "Inadimplência", path: "/inadimplencia" },
  { icon: History, label: "Histórico", path: "/historico" },
  { icon: BarChart3, label: "Relatórios", path: "/relatorios" },
  { icon: Settings, label: "Configurações", path: "/configuracoes" },
];

/** Conteúdo compartilhado do sidebar (usado desktop e mobile) */
function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const location = useLocation();
  const { logout } = useAuth();
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  const handleLinkClick = () => {
    onNavigate?.();
  };

  return (
    <>
      <nav className="flex-1 p-3 xl:p-4 flex flex-col overflow-y-auto">
        <ul className="space-y-1 xl:space-y-2 flex-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            const hasSubitems = item.subitems && item.subitems.length > 0;
            const isHovered = hoveredItem === item.path;
            
            const iconAnimation = {
              Home: "group-hover:scale-110 group-hover:rotate-[8deg] transition-all duration-300",
              Gavel: "group-hover:rotate-[15deg] group-hover:scale-110 transition-all duration-300",
              Package: "group-hover:scale-110 group-hover:-translate-y-1 transition-all duration-300",
              UserPlus: "group-hover:scale-110 group-hover:-translate-y-1 transition-all duration-300",
              Handshake: "group-hover:scale-110 group-hover:rotate-[-5deg] transition-all duration-300",
              Users: "group-hover:scale-125 transition-all duration-300",
              FileText: "group-hover:rotate-[10deg] group-hover:scale-110 transition-all duration-300",
              AlertTriangle: "group-hover:animate-bounce",
              BarChart3: "group-hover:scale-110 group-hover:translate-y-[-2px] transition-all duration-300",
              Settings: "group-hover:rotate-90 transition-all duration-500",
            }[item.icon.name] || "group-hover:scale-110 transition-all duration-300";
            
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
                  onClick={handleLinkClick}
                  className={cn(
                    "group flex items-center rounded-lg transition-colors",
                    collapsed ? "justify-center py-3 px-5 mx-0" : "space-x-3 px-3 py-2.5",
                    isActive
                      ? "bg-gray-100 text-black"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className={cn("h-5 w-5 flex-shrink-0", iconAnimation)} />
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
        
        {/* Área de navegação com botão toggle centralizado entre os itens do menu */}
        <div className="relative flex-1 flex flex-col min-h-0">
          {/* Botão toggle posicionado na borda direita, centralizado na área do menu */}
          <div className="group/edge absolute -right-4 top-0 bottom-0 w-8 z-10 flex items-center justify-center">
            <button
              onClick={toggleSidebar}
              className={cn(
                "group/toggle relative",
                "h-8 w-8 rounded-full",
                "bg-white border border-gray-200 shadow-sm",
                "opacity-60 group-hover/edge:opacity-100",
                "group-hover/edge:shadow-md group-hover/edge:border-gray-300",
                "hover:!bg-gray-100 hover:!border-gray-400 hover:!shadow-lg",
                "active:scale-90 active:shadow-sm",
                "flex items-center justify-center",
                "transition-all duration-200 ease-out",
                "cursor-pointer"
              )}
              title={isCollapsed ? "Expandir menu" : "Retrair menu"}
            >
              {isCollapsed ? (
                <ChevronsRight className="h-4 w-4 text-gray-400 group-hover/toggle:text-gray-700 transition-colors duration-150" />
              ) : (
                <ChevronsLeft className="h-4 w-4 text-gray-400 group-hover/toggle:text-gray-700 transition-colors duration-150" />
              )}
            </button>
          </div>
          
          <SidebarContent collapsed={isCollapsed} />
        </div>
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
