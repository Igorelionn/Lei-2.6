import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";

export default function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname?: string } } };
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true });
    } else {
      // Limpar qualquer estado de erro quando chegar na tela de login
      setError(null);
      setIsLoading(false);
    }
  }, [isAuthenticated, navigate]);

  // Verificar se há mensagens de desativação ou exclusão
  useEffect(() => {
    const deactivationMessage = localStorage.getItem('deactivation-message');
    const deletionMessage = localStorage.getItem('deletion-message');
    
    if (deactivationMessage) {
      localStorage.removeItem('deactivation-message');
    }
    
    if (deletionMessage) {
      localStorage.removeItem('deletion-message');
    }
  }, []);

  // Limpar campos quando o componente for montado (após logout)
  useEffect(() => {
    setUsername("");
    setPassword("");
    setError(null);
    setIsLoading(false);
    setShowPassword(false);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login({ email: username, password });
      const redirectTo = location?.state?.from?.pathname || "/";
      navigate(redirectTo, { replace: true });
    } catch (err: unknown) {
      const error = err as Error;
      setError(error?.message || "Falha no login");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      {/* Container principal */}
      <div className="w-full max-w-xl p-12 bg-white">
        {/* Logo */}
        <div className="flex justify-center mb-12">
          <img 
            src="/arthur-lira-logo.png" 
            alt="Arthur Lira Leilões" 
            className="h-16 w-auto object-contain"
          />
        </div>
        
        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Campo Usuário */}
          <div className="space-y-2">
            <Label htmlFor="username" className="text-black text-sm font-medium">
              Usuário
            </Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder=""
              autoComplete="username"
              required
              className="w-full h-11 bg-transparent border-gray-400 border-b border-t-0 border-l-0 border-r-0 rounded-none text-black placeholder-gray-500 focus:border-black px-0 no-focus-outline"
            />
          </div>
          
          {/* Campo Senha */}
          <div className="space-y-2">
            <Label htmlFor="password" className="text-black text-sm font-medium">
              Senha
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=""
                autoComplete="current-password"
                required
                className="w-full h-11 bg-transparent border-gray-400 border-b border-t-0 border-l-0 border-r-0 rounded-none text-black placeholder-gray-500 focus:border-black px-0 pr-10 no-focus-outline"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-black transition-all duration-200 ease-in-out"
              >
                <div className="relative w-5 h-5">
                  {/* Olho Aberto - quando senha está visível */}
                  <svg 
                    className={`h-5 w-5 absolute inset-0 transition-all duration-300 ease-in-out ${
                      showPassword 
                        ? 'opacity-100 scale-100 rotate-0' 
                        : 'opacity-0 scale-75 rotate-12'
                    }`}
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  
                  {/* Olho Fechado - quando senha está oculta */}
                  <svg 
                    className={`h-5 w-5 absolute inset-0 transition-all duration-300 ease-in-out ${
                      showPassword 
                        ? 'opacity-0 scale-75 rotate-12' 
                        : 'opacity-100 scale-100 rotate-0'
                    }`}
                    xmlns="http://www.w3.org/2000/svg" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <path d="m15 18-.722-3.25"/>
                    <path d="M2 8a10.645 10.645 0 0 0 20 0"/>
                    <path d="m20 15-1.726-2.05"/>
                    <path d="m4 15 1.726-2.05"/>
                    <path d="m9 18 .722-3.25"/>
                  </svg>
                </div>
              </button>
            </div>
          </div>
          
          {/* Mensagem de erro */}
          {error && (
            <div className="text-red-500 text-sm text-center">
              {error}
            </div>
          )}
          
          {/* Botão de login */}
          <div className="pt-4">
            <Button 
              type="submit" 
              disabled={isLoading}
              className="w-full h-11 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-sm transition-colors"
            >
              {isLoading ? "Entrando..." : "Entrar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
