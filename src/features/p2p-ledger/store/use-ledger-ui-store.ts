"use client";

import { create } from "zustand";
import type { UserRoleType } from "@/features/p2p-ledger/schemas/p2p.schemas";

export type ActiveWorkspaceTab = "DASHBOARD_LIVE" | "VAULT_AND_CLOSINGS";

interface LedgerUiState {
  readonly activeTab: ActiveWorkspaceTab;
  readonly activeRole: UserRoleType;
  readonly isVaultDialogOpen: boolean;
  readonly isUnlockAccountantModalOpen: boolean;
  readonly isClosingExportModalOpen: boolean;
  setActiveTab: (tab: ActiveWorkspaceTab) => void;
  setActiveRole: (role: UserRoleType) => void;
  setVaultDialogOpen: (open: boolean) => void;
  setUnlockAccountantModalOpen: (open: boolean) => void;
  setClosingExportModalOpen: (open: boolean) => void;
}

export const useLedgerUiStore = create<LedgerUiState>((set) => ({
  activeTab: "DASHBOARD_LIVE",
  activeRole: "OPERATOR",
  isVaultDialogOpen: false,
  isUnlockAccountantModalOpen: false,
  isClosingExportModalOpen: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setActiveRole: (role) => set({ activeRole: role }),
  setVaultDialogOpen: (open) => set({ isVaultDialogOpen: open }),
  setUnlockAccountantModalOpen: (open) =>
    set({ isUnlockAccountantModalOpen: open }),
  setClosingExportModalOpen: (open) =>
    set({ isClosingExportModalOpen: open }),
}));
