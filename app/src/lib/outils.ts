import type { Publication, PubCanal } from "../types";
import type { Metrique } from "../regles";

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const lireIso = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const aujourdhui = () => isoDate(new Date());
export const ajouterJours = (s: string, n: number) => { const d = lireIso(s); d.setDate(d.getDate() + n); return isoDate(d); };
export const premierDuMois = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const cleMois = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const decalerMois = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

export const fmtDateCourte = (s: string | null) =>
  s ? lireIso(s).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "Sans date";
export const fmtDateLongue = (s: string) =>
  lireIso(s).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const fmtMois = (d: Date) => d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
export const fmtHorodatage = (s: string) =>
  new Date(s).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const fmtHeure = (s: string | null) => (s ? s.slice(0, 5) : "");
export const fmtNombre = (n: number | null | undefined) => (n == null ? "–" : Number(n).toLocaleString("fr-FR"));
export const fmtTaille = (o: number | null) =>
  o == null ? "" : o < 1024 * 1024 ? `${Math.max(1, Math.round(o / 1024))} Ko` : `${(o / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;

export const triParDate = (a: Publication, b: Publication) =>
  ((a.date_diffusion ?? "9999") + (a.heure_diffusion ?? "")).localeCompare((b.date_diffusion ?? "9999") + (b.heure_diffusion ?? ""));

export const aDesStats = (c: PubCanal) => c.stats_saisies_le != null || [c.portee, c.interactions, c.partages, c.clics].some((v) => v != null);
export const pubADesStats = (p: Publication) => p.canaux.some(aDesStats);

export function totalStats(p: Publication, canalId?: number): Record<Metrique, number> {
  const t = { portee: 0, interactions: 0, partages: 0, clics: 0 };
  for (const c of p.canaux) {
    if (canalId && c.canal_id !== canalId) continue;
    t.portee += c.portee ?? 0; t.interactions += c.interactions ?? 0; t.partages += c.partages ?? 0; t.clics += c.clics ?? 0;
  }
  return t;
}

export const graduationRonde = (v: number) => {
  if (v <= 0) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

/** Fichier CSV lisible par Excel en français (séparateur ; et BOM UTF-8). */
export function versCsv(lignes: (string | number | null | undefined)[][]): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "﻿" + lignes.map((l) => l.map(q).join(";")).join("\r\n");
}

export function telecharger(nom: string, contenu: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copier(texte: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(texte); return true; } catch { return false; }
}

export function lireStockage<T>(cle: string, defaut: T): T {
  try { const v = localStorage.getItem(cle); return v ? (JSON.parse(v) as T) : defaut; } catch { return defaut; }
}
export function ecrireStockage(cle: string, valeur: unknown) {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch { /* stockage indisponible */ }
}
export function effacerStockage(prefixe: string) {
  try { Object.keys(localStorage).filter((k) => k.startsWith(prefixe)).forEach((k) => localStorage.removeItem(k)); } catch { /* */ }
}
