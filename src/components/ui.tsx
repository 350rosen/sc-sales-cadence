export function PageHeader({ title, cta }: { title: string; cta?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-5xl font-extrabold tracking-tight">{title}</h1>
      {cta}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border rounded-lg ${className}`}>{children}</div>;
}

// in components/ui.tsx
import React from "react";
import clsx from "clsx";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  const base =
    "px-4 py-2 rounded-md font-medium text-sm transition focus:outline-none focus:ring-2 focus:ring-offset-1";

  const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
    primary: "bg-sc-green text-white hover:bg-sc-green/90 focus:ring-sc-green",
    secondary:
      "bg-sc-offwhite text-sc-delft border border-sc-delft/20 hover:bg-sc-offwhite/80 focus:ring-sc-delft/30",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
  };

  return (
    <button
      className={clsx(base, variants[variant], className)}
      {...props}
    />
  );
}

// accent
export function ButtonAccent(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className="px-4 py-2 rounded-md bg-sc-orange text-white hover:opacity-90 transition" {...props} />;
}

export function Table({ children }: { children: React.ReactNode }) {
  return <table className="w-full text-sm">{children}</table>;
}
