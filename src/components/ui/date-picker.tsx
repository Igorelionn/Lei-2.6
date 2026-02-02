import * as React from "react";
import { format, isValid, parseISO, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DatePickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  id?: string;
  allowClear?: boolean;
  minDate?: Date;
  maxDate?: Date;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Selecione uma data",
  disabled = false,
  className,
  required = false,
  id,
  allowClear = true,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.(undefined);
  };

  const isDateDisabled = (date: Date) => {
    if (disabled) return true;
    // Apenas respeita as datas min/max passadas como props, sem outras restrições
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false; // Permite todas as datas por padrão
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn(
            "h-11 w-full justify-start text-left font-normal border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white hover:bg-gray-50",
            !value && "text-muted-foreground",
            disabled && "opacity-50 cursor-not-allowed hover:bg-white",
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-gray-500 group-hover:text-white transition-colors" />
          <span className="flex-1 text-left">
            {value && isValid(value) ? (
              format(value, "dd/MM/yyyy", { locale: ptBR })
            ) : (
              placeholder
            )}
          </span>
          {value && allowClear && !disabled && (
            <X 
              className="ml-2 h-4 w-4 text-gray-400 hover:text-white hover:bg-gray-600 rounded cursor-pointer p-0.5" 
              onClick={handleClear}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-[100000]" align="start" side="bottom">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onChange?.(date);
            setOpen(false);
          }}
          disabled={isDateDisabled}
          initialFocus
          locale={ptBR}
        />
      </PopoverContent>
    </Popover>
  );
}

// Componente para converter string de data para Date e vice-versa
interface StringDatePickerProps {
  value?: string;
  onChange?: (dateString: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  id?: string;
  allowClear?: boolean;
  minDate?: Date;
  maxDate?: Date;
}

export function StringDatePicker({
  value,
  onChange,
  placeholder = "dd/mm/aaaa",
  disabled = false,
  className,
  required = false,
  id,
  allowClear = true,
  minDate,
  maxDate,
}: StringDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");

  const dateValue = React.useMemo(() => {
    if (!value || value === "") return undefined;
    try {
      const parsedDate = parseISO(value);
      return isValid(parsedDate) ? parsedDate : undefined;
    } catch {
      return undefined;
    }
  }, [value]);

  // Atualiza o valor do input quando a prop value muda
  React.useEffect(() => {
    if (dateValue && isValid(dateValue)) {
      setInputValue(format(dateValue, "dd/MM/yyyy"));
    } else {
      setInputValue("");
    }
  }, [dateValue]);

  const handleDateChange = (date: Date | undefined) => {
    if (date && isValid(date)) {
      // Converte para formato YYYY-MM-DD
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      onChange?.(`${year}-${month}-${day}`);
    } else {
      onChange?.("");
    }
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let rawValue = e.target.value.replace(/\D/g, ''); // Remove tudo que não é dígito
    
    // Limita a 8 dígitos (ddmmaaaa)
    if (rawValue.length > 8) {
      rawValue = rawValue.slice(0, 8);
    }

    // Aplica a máscara dd/mm/aaaa
    let maskedValue = '';
    if (rawValue.length > 0) {
      maskedValue = rawValue.slice(0, 2);
    }
    if (rawValue.length > 2) {
      maskedValue += '/' + rawValue.slice(2, 4);
    }
    if (rawValue.length > 4) {
      maskedValue += '/' + rawValue.slice(4, 8);
    }

    setInputValue(maskedValue);

    // Se temos 8 dígitos, tenta fazer parse da data
    if (rawValue.length === 8) {
      const day = rawValue.slice(0, 2);
      const month = rawValue.slice(2, 4);
      const year = rawValue.slice(4, 8);
      
      try {
        const parsedDate = parse(`${day}/${month}/${year}`, "dd/MM/yyyy", new Date());
        if (isValid(parsedDate)) {
          // Converte para formato YYYY-MM-DD e chama onChange imediatamente
          const year = parsedDate.getFullYear();
          const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
          const day = String(parsedDate.getDate()).padStart(2, '0');
          onChange?.(`${year}-${month}-${day}`);
        } else {
          // Data inválida, chama onChange com string vazia para garantir que o status seja atualizado
          onChange?.("");
        }
      } catch {
        // Erro de parsing, chama onChange com string vazia
        onChange?.("");
      }
    } else if (rawValue.length === 0) {
      // Campo limpo, chama onChange com string vazia
      onChange?.("");
    }
    // Para valores parciais (menos de 8 dígitos), não chama onChange para evitar status incorreto
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputValue("");
    onChange?.("");
  };

  const isDateDisabled = (date: Date) => {
    if (disabled) return true;
    // Apenas respeita as datas min/max passadas como props, sem outras restrições
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false; // Permite todas as datas por padrão
  };

  return (
    <div className="relative">
      <Input
        id={id}
        value={inputValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "h-11 pr-20 border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white",
          className
        )}
        maxLength={10}
      />
      
      <div className="absolute inset-y-0 right-0 flex items-center">
        {inputValue && allowClear && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 mr-1 text-gray-400 hover:text-white hover:bg-gray-600 rounded"
            onClick={handleClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 mr-1 text-gray-500 hover:text-white hover:bg-gray-600 rounded"
              disabled={disabled}
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 z-[100000]" align="start" side="bottom">
            <Calendar
              mode="single"
              selected={dateValue}
              onSelect={handleDateChange}
              disabled={isDateDisabled}
              initialFocus
              locale={ptBR}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
