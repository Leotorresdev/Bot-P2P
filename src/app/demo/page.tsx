import type { Metadata } from "next";
import { InteractiveDemoScreen } from "@/features/p2p-ledger/components/interactive-demo-screen";

export const metadata: Metadata = {
  title: "Demo Interactiva — Bot P2P Venezuela (Prueba Gratis sin API Key)",
  description:
    "Prueba paso a paso cómo funciona Bot P2P Venezuela: brechas bancarias en vivo con alertas sonoras, control de jornadas, motor de ganancias por vuelta, modo contador SENIAT y Excel de 3 hojas.",
};

export default function DemoPage() {
  return <InteractiveDemoScreen />;
}
