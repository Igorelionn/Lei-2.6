import { DomainState, Auction, Lot, Bidder, Invoice, InvoiceStatus } from "@/lib/types";
import { generateSecureId, safeJsonParse } from "./secure-utils"; // 🔒 SEGURANÇA

const STORAGE_KEY = "auction-usher.db";

function emptyState(): DomainState {
  return { auctions: [], lots: [], bidders: [], invoices: [] };
}

function readState(): DomainState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyState();
  
  // 🔒 SEGURANÇA: Parse seguro com fallback
  return safeJsonParse<DomainState>(raw, emptyState());
}

function writeState(state: DomainState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// 🔒 SEGURANÇA: Usar crypto.randomUUID() ao invés de Math.random()
function genId(prefix: string): string {
  return generateSecureId(prefix);
}

export const db = {
  getState(): DomainState {
    return readState();
  },

  // Auctions
  listAuctions(): Auction[] {
    return readState().auctions;
  },
  getAuction(id: string): Auction | undefined {
    return readState().auctions.find(a => a.id === id);
  },
  createAuction(data: Omit<Auction, "id">): Auction {
    const state = readState();
    const created: Auction = { ...data, id: genId("a") };
    state.auctions.push(created);
    writeState(state);
    return created;
  },
  updateAuction(id: string, data: Partial<Auction>): Auction | undefined {
    const state = readState();
    const idx = state.auctions.findIndex(a => a.id === id);
    if (idx < 0) return undefined;
    state.auctions[idx] = { ...state.auctions[idx], ...data };
    writeState(state);
    return state.auctions[idx];
  },
  deleteAuction(id: string): boolean {
    const state = readState();
    const before = state.auctions.length;
    state.auctions = state.auctions.filter(a => a.id !== id);
    // cascade delete lots and invoices of this auction
    const auctionLots = state.lots.filter(l => l.auctionId === id).map(l => l.id);
    state.lots = state.lots.filter(l => l.auctionId !== id);
    state.invoices = state.invoices.filter(inv => inv.auctionId !== id && !auctionLots.includes(inv.lotId));
    writeState(state);
    return state.auctions.length < before;
  },

  // Lots
  listLots(auctionId?: string): Lot[] {
    const lots = readState().lots;
    return auctionId ? lots.filter(l => l.auctionId === auctionId) : lots;
  },
  getLot(id: string): Lot | undefined {
    return readState().lots.find(l => l.id === id);
  },
  createLot(data: Omit<Lot, "id">): Lot {
    const state = readState();
    const created: Lot = { ...data, id: genId("l") };
    state.lots.push(created);
    writeState(state);
    return created;
  },
  updateLot(id: string, data: Partial<Lot>): Lot | undefined {
    const state = readState();
    const idx = state.lots.findIndex(l => l.id === id);
    if (idx < 0) return undefined;
    state.lots[idx] = { ...state.lots[idx], ...data };
    writeState(state);
    return state.lots[idx];
  },
  deleteLot(id: string): boolean {
    const state = readState();
    const before = state.lots.length;
    state.lots = state.lots.filter(l => l.id !== id);
    state.invoices = state.invoices.filter(inv => inv.lotId !== id);
    writeState(state);
    return state.lots.length < before;
  },

  // Bidders
  listBidders(): Bidder[] {
    return readState().bidders;
  },
  getBidder(id: string): Bidder | undefined {
    return readState().bidders.find(b => b.id === id);
  },
  createBidder(data: Omit<Bidder, "id">): Bidder {
    const state = readState();
    const created: Bidder = { ...data, id: genId("b") };
    state.bidders.push(created);
    writeState(state);
    return created;
  },
  updateBidder(id: string, data: Partial<Bidder>): Bidder | undefined {
    const state = readState();
    const idx = state.bidders.findIndex(b => b.id === id);
    if (idx < 0) return undefined;
    state.bidders[idx] = { ...state.bidders[idx], ...data };
    writeState(state);
    return state.bidders[idx];
  },
  deleteBidder(id: string): boolean {
    const state = readState();
    const before = state.bidders.length;
    state.bidders = state.bidders.filter(b => b.id !== id);
    state.invoices = state.invoices.filter(inv => inv.arrematanteId !== id);
    writeState(state);
    return state.bidders.length < before;
  },

  // Invoices
  listInvoices(status?: InvoiceStatus): Invoice[] {
    const invoices = readState().invoices;
    return status ? invoices.filter(i => i.status === status) : invoices;
  },
  getInvoice(id: string): Invoice | undefined {
    return readState().invoices.find(i => i.id === id);
  },
  createInvoice(data: Omit<Invoice, "id">): Invoice {
    const state = readState();
    const created: Invoice = { ...data, id: genId("i") };
    state.invoices.push(created);
    writeState(state);
    return created;
  },
  updateInvoice(id: string, data: Partial<Invoice>): Invoice | undefined {
    const state = readState();
    const idx = state.invoices.findIndex(i => i.id === id);
    if (idx < 0) return undefined;
    state.invoices[idx] = { ...state.invoices[idx], ...data };
    writeState(state);
    return state.invoices[idx];
  },
  deleteInvoice(id: string): boolean {
    const state = readState();
    const before = state.invoices.length;
    state.invoices = state.invoices.filter(i => i.id !== id);
    writeState(state);
    return state.invoices.length < before;
  },
};

// Helpers de negócios
export function computeInvoiceStatusByDueDate(vencimentoISO: string, isPaid: boolean): InvoiceStatus {
  if (isPaid) return "pago";
  const today = new Date().toISOString().slice(0, 10);
  return today > vencimentoISO ? "atrasado" : "em_aberto";
}


