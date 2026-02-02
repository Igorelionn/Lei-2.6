import { calcularEstruturaParcelas } from "@/lib/parcelamento-calculator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface ParcelamentoPreviewProps {
  valorTotal: number;
  parcelasTriplas?: number;
  parcelasDuplas?: number;
  parcelasSimples?: number;
  className?: string;
}

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function ParcelamentoPreview({ 
  valorTotal, 
  parcelasTriplas = 0,
  parcelasDuplas = 0,
  parcelasSimples = 0,
  className = "" 
}: ParcelamentoPreviewProps) {
  if (valorTotal <= 0) {
    return null;
  }
  
  const estrutura = calcularEstruturaParcelas(
    valorTotal, 
    parcelasTriplas, 
    parcelasDuplas, 
    parcelasSimples
  );
  
  if (estrutura.length === 0) {
    return null;
  }
  
  const totalCalculado = estrutura.reduce((sum, p) => sum + p.valor, 0);
  const totalParcelas = parcelasTriplas + parcelasDuplas + parcelasSimples;
  
  const getTipoBadge = (tipo: string) => {
    switch (tipo) {
      case 'entrada':
        return <Badge className="bg-blue-100 text-blue-800">Entrada</Badge>;
      case 'tripla':
        return <Badge className="bg-purple-100 text-purple-800">Tripla</Badge>;
      case 'dupla':
        return <Badge className="bg-orange-100 text-orange-800">Dupla</Badge>;
      case 'simples':
      default:
        return <Badge className="bg-gray-100 text-gray-800">Simples</Badge>;
    }
  };
  
  return (
    <Card className={`border-0 shadow-sm ${className}`}>
      <CardHeader className="bg-gray-50 border-b border-gray-200">
        <CardTitle className="text-lg font-semibold text-gray-900">
          Preview do Parcelamento
        </CardTitle>
        <p className="text-sm text-gray-600 mt-1">
          {parcelasTriplas > 0 && `${parcelasTriplas} Triplas`}
          {parcelasTriplas > 0 && (parcelasDuplas > 0 || parcelasSimples > 0) && ' + '}
          {parcelasDuplas > 0 && `${parcelasDuplas} Duplas`}
          {parcelasDuplas > 0 && parcelasSimples > 0 && ' + '}
          {parcelasSimples > 0 && `${parcelasSimples} Simples`}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-auto max-h-96">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-200">
                <TableHead className="font-semibold text-gray-700">Parcela</TableHead>
                <TableHead className="font-semibold text-gray-700">Tipo</TableHead>
                <TableHead className="font-semibold text-gray-700">Valor</TableHead>
                <TableHead className="font-semibold text-gray-700">Multiplicador</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {estrutura.map((parcela) => (
                <TableRow key={parcela.numero} className="border-gray-100">
                  <TableCell className="font-medium text-gray-900">
                    {parcela.numero}
                  </TableCell>
                  <TableCell>
                    {getTipoBadge(parcela.tipo)}
                  </TableCell>
                  <TableCell className="font-semibold text-gray-900">
                    {currency.format(parcela.valor)}
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {parcela.multiplicador}x
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        
        {/* Resumo */}
        <div className="bg-gray-50 border-t border-gray-200 p-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Total de Parcelas:</span>
            <span className="text-sm font-semibold text-gray-900">{totalParcelas}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Valor Total:</span>
            <span className="text-sm font-semibold text-gray-900">{currency.format(valorTotal)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Total Calculado:</span>
            <span className={`text-sm font-semibold ${Math.abs(totalCalculado - valorTotal) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
              {currency.format(totalCalculado)}
            </span>
          </div>
          
          {Math.abs(totalCalculado - valorTotal) >= 0.01 && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-xs text-yellow-800">
                ⚠️ Diferença de {currency.format(Math.abs(totalCalculado - valorTotal))} devido a arredondamento
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
