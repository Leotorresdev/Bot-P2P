import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-0.5 font-mono text-[11px] font-bold transition-colors",
  {
    variants: {
      variant: {
        emerald:
          "border border-alpine-emeraldBorder bg-alpine-emeraldSoft text-alpine-emeraldDark",
        amber:
          "border border-alpine-amberBorder bg-alpine-amberSoft text-alpine-amberDark",
        neutral: "border border-[#CBD5E1] bg-alpine-border text-alpine-ink",
        danger: "border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
      },
    },
    defaultVariants: {
      variant: "emerald",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
