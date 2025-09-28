import * as React from "react";

type Props = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  color?: "green" | "orange" | "delft" | "black";
  size?: number;            // px
  stroke?: number;          // line thickness
  className?: string;
};

const COLOR_CLASS = {
  green:  "text-sc-green",
  orange: "text-sc-orange",
  delft:  "text-sc-delft",
  black:  "text-sc-black",
};

export default function BrandIcon({
  icon: Icon,
  color = "green",
  size = 18,
  stroke = 1.75,
  className = "",
}: Props) {
  return <Icon className={`${COLOR_CLASS[color]} ${className}`} width={size} height={size} strokeWidth={stroke} />;
}
