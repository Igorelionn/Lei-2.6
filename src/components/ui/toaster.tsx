import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { WifiOff, Wifi } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        // Ícone e cores baseados no variant
        const Icon = variant === "destructive" ? WifiOff : Wifi;
        
        const textColor = variant === "destructive"
          ? "text-gray-700"
          : "text-gray-700";
        
        const iconColor = variant === "destructive"
          ? "text-red-500"
          : "text-emerald-500";

        return (
          <Toast 
            key={id} 
            variant={variant}
            {...props} 
            className="p-3 px-4 bg-white/90 backdrop-blur-md rounded-full"
          >
            <div className="flex items-center gap-3">
              {/* Ícone de internet */}
              <Icon className={`h-5 w-5 ${iconColor} flex-shrink-0`} />
              
              {/* Texto */}
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${textColor}`}>
                  {title}
                </span>
                
                {/* Animação de aguardando (apenas para "Sem conexão") */}
                {variant === "destructive" && (
                  <div className="flex items-center gap-1 ml-1">
                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
              )}
              </div>
            </div>
            {action}
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
