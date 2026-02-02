// 🔒 SEGURANÇA: Componente seguro para substituir innerHTML com ícone SVG
// Este componente evita vulnerabilidades XSS ao usar JSX em vez de innerHTML

interface ImagePlaceholderIconProps {
  className?: string;
  size?: number;
}

export const ImagePlaceholderIcon = ({ className = "text-gray-300", size = 32 }: ImagePlaceholderIconProps) => {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  );
};
