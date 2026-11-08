import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-[10px] border border-[#CBD5E1] bg-alpine-snow px-3.5 py-2.5 font-mono text-[13px] text-alpine-ink placeholder:text-alpine-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alpine-emerald disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
