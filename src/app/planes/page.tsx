import type { Metadata } from "next";
import { PlansShowcaseScreen } from "@/features/p2p-ledger/components/plans-showcase-screen";

export const metadata: Metadata = {
  title: "Nuestros Planes — Bot P2P Venezuela",
  description:
    "Conoce el Plan Básico de Bot P2P por $30 mensuales (gráficas, brechas, resultados, historial, modo contador y reportes Excel) y nuestra arquitectura modular de Skills.",
};

export default function PlanesPage() {
  return <PlansShowcaseScreen />;
}
