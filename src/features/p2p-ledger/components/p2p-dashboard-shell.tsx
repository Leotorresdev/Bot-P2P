"use client";

import * as React from "react";
import { TopNavigationBar } from "@/features/p2p-ledger/components/top-navigation-bar";
import { BentoModulesGrid } from "@/features/p2p-ledger/components/bento-modules-grid";
import { LiveOperationsLedger } from "@/features/p2p-ledger/components/live-operations-ledger";
import { SecurityAndClosingsView } from "@/features/p2p-ledger/components/security-and-closings-view";
import { AccountantTaxView } from "@/features/p2p-ledger/components/accountant-tax-view";
import { useLedgerUiStore } from "@/features/p2p-ledger/store/use-ledger-ui-store";
import type {
  LotMethod,
  PeriodFilter,
} from "@/features/p2p-ledger/schemas/p2p.schemas";

export function P2PDashboardShell() {
  const { activeTab, activeRole } = useLedgerUiStore();
  const [period, setPeriod] = React.useState<PeriodFilter>("TODAY");
  const [method, setMethod] = React.useState<LotMethod>("FIFO");
  const [selectedBank, setSelectedBank] = React.useState<string | null>(null);

  const isAccountant = activeRole === "AUDITOR_SENIAT";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col gap-6 bg-[#F4F7F9] px-4 py-7 sm:px-9">
      <TopNavigationBar />

      {isAccountant ? (
        <AccountantTaxView />
      ) : activeTab === "DASHBOARD_LIVE" ? (
        <>
          <BentoModulesGrid
            period={period}
            method={method}
            selectedBank={selectedBank}
            onPeriodChange={setPeriod}
            onMethodChange={setMethod}
            onSelectBank={setSelectedBank}
          />
          <LiveOperationsLedger
            period={period}
            selectedBank={selectedBank}
            onSelectBank={setSelectedBank}
          />
        </>
      ) : (
        <SecurityAndClosingsView />
      )}
    </main>
  );
}
