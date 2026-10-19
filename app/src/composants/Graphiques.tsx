import { useEffect, useRef, useState } from "react";
import { fmtNombre, graduationRonde } from "../lib/outils";

/** Largeur réelle du conteneur : le dessin garde des textes lisibles sur téléphone. */
function useLargeur(defaut = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [l, setL] = useState(defaut);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setL(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, l] as const;
}

export interface Barre { libelle: string; valeur: number; couleur: string }

/** Barres horizontales à l'échelle, avec graduations et valeur en bout de barre. */
export function BarresHorizontales({ barres, titre }: { barres: Barre[]; titre: string }) {
  const [ref, W] = useLargeur();
  const max = graduationRonde(Math.max(0, ...barres.map((b) => b.valeur)));
  const H = Math.max(1, barres.length) * 30 + 34, g = W < 420 ? 104 : 130, d = 52, largeur = W - g - d;
  const graduations = W < 420 ? [0, 2, 4] : [0, 1, 2, 3, 4];
  return (
    <div className="graphique" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titre}>
        {graduations.map((i) => {
          const x = g + (largeur * i) / 4;
          return <g key={i}><line x1={x} y1={4} x2={x} y2={H - 24} stroke="var(--line)" /><text x={x} y={H - 8} textAnchor="middle">{fmtNombre((max * i) / 4)}</text></g>;
        })}
        {barres.map((b, i) => {
          const y = 8 + i * 30, w = (largeur * b.valeur) / max;
          return (
            <g key={b.libelle}>
              <text x={g - 8} y={y + 14} textAnchor="end">{b.libelle}</text>
              <rect x={g} y={y + 3} width={Math.max(w, b.valeur ? 2 : 0)} height={16} rx={4} fill={b.couleur} />
              <text className="valeur" x={g + w + 6} y={y + 15}>{fmtNombre(b.valeur)}</text>
            </g>
          );
        })}
        {!barres.length && <text x={W / 2} y={24} textAnchor="middle">Aucune donnée sur la période</text>}
      </svg>
    </div>
  );
}

/** Colonnes verticales (évolution mensuelle) ; la dernière colonne est mise en avant. */
export function Colonnes({ colonnes, titre }: { colonnes: { libelle: string; valeur: number }[]; titre: string }) {
  const [ref, W] = useLargeur();
  const max = graduationRonde(Math.max(0, ...colonnes.map((c) => c.valeur)));
  const H = 220, g = 52, d = 8, h = 16, b = 34, l = (W - g - d) / Math.max(1, colonnes.length);
  return (
    <div className="graphique" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titre}>
        {[0, 1, 2, 3, 4].map((i) => {
          const y = h + (H - h - b) * (1 - i / 4);
          return <g key={i}><line x1={g} y1={y} x2={W - d} y2={y} stroke="var(--line)" /><text x={g - 6} y={y + 4} textAnchor="end">{fmtNombre((max * i) / 4)}</text></g>;
        })}
        {colonnes.map((c, i) => {
          const haut = ((H - h - b) * c.valeur) / max, x = g + i * l + l * 0.2, y = H - b - haut, dernier = i === colonnes.length - 1;
          return (
            <g key={c.libelle + i}>
              <rect x={x} y={y} width={l * 0.6} height={Math.max(haut, 0)} rx={4} fill={dernier ? "var(--gold)" : "var(--navy)"} opacity={dernier ? 1 : 0.78} />
              <text x={x + l * 0.3} y={H - b + 16} textAnchor="middle">{c.libelle}</text>
              {c.valeur > 0 && <text className="valeur" x={x + l * 0.3} y={y - 5} textAnchor="middle">{fmtNombre(c.valeur)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
