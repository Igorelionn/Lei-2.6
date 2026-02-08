import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, style, ...props }, ref) => {
    // Verifica se é um wizard-input para aplicar estilo inline de cor
    const isWizardInput = className?.includes('wizard-input');
    
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 sm:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        style={isWizardInput ? { 
          color: '#111827', 
          WebkitTextFillColor: '#111827',
          ...style 
        } : style}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
