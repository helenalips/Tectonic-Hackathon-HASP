import { createContext, useContext } from "react";
import type { ClientSummary } from "../api/types";

export interface ClientsState {
  clients: ClientSummary[];
  reload: () => void;
}

export const ClientsContext = createContext<ClientsState>({ clients: [], reload: () => undefined });

export const useClients = () => useContext(ClientsContext);
