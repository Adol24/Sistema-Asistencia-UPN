import { Link } from "@tanstack/react-router";

import type { RutaConstruida } from "@/lib/mapa-pantallas";

const items: { to: RutaConstruida; label: string }[] = [
  { to: "/portal/estado", label: "Estado" },
  { to: "/portal/qr", label: "Mi QR" },
  { to: "/portal/evidencias", label: "Evidencias" },
  { to: "/portal/constancia", label: "Constancia" },
];

export function PortalNav() {
  return (
    <nav className="mb-5 flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
      {items.map((i) => (
        <Link
          key={i.to}
          to={i.to}
          activeProps={{ className: "bg-primary text-primary-foreground" }}
          className="flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted"
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
