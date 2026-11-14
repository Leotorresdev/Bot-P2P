"use client";

import { create } from "zustand";
import type { UserRoleType } from "@/features/p2p-ledger/schemas/p2p.schemas";

export type ActiveWorkspaceTab = "MARKET_LIVE" | "RESULTS";
export type ResultsSubTab = "OPERATIONS" | "VAULT_AND_CLOSINGS";

interface LedgerUiState {
  readonly activeTab: ActiveWorkspaceTab;
  readonly resultsSubTab: ResultsSubTab;
  readonly isResultsUnlocked: boolean;
  readonly activeRole: UserRoleType;
  readonly isVaultDialogOpen: boolean;
  readonly isUnlockAccountantModalOpen: boolean;
  readonly isClosingExportModalOpen: boolean;
  setActiveTab: (tab: ActiveWorkspaceTab) => void;
  setResultsSubTab: (subTab: ResultsSubTab) => void;
  setResultsUnlocked: (unlocked: boolean) => void;
  lockResultsPanel: () => void;
  setActiveRole: (role: UserRoleType) => void;
  setVaultDialogOpen: (open: boolean) => void;
  setUnlockAccountantModalOpen: (open: boolean) => void;
  setClosingExportModalOpen: (open: boolean) => void;
}

export const useLedgerUiStore = create<LedgerUiState>((set) => ({
  activeTab: "MARKET_LIVE",
  resultsSubTab: "OPERATIONS",
  isResultsUnlocked: false,
  activeRole: "OPERATOR",
  isVaultDialogOpen: false,
  isUnlockAccountantModalOpen: false,
  isClosingExportModalOpen: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setResultsSubTab: (subTab) => set({ resultsSubTab: subTab }),
  setResultsUnlocked: (unlocked) => set({ isResultsUnlocked: unlocked }),
  lockResultsPanel: () =>
    set({
      isResultsUnlocked: false,
      activeRole: "OPERATOR",
    }),
  setActiveRole: (role) => set({ activeRole: role }),
  setVaultDialogOpen: (open) => set({ isVaultDialogOpen: open }),
  setUnlockAccountantModalOpen: (open) =>
    set({ isUnlockAccountantModalOpen: open }),
  setClosingExportModalOpen: (open) =>
    set({ isClosingExportModalOpen: open }),
}));
