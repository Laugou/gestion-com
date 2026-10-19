// Installation et mises à jour de l'application (PWA).
import { registerSW } from "virtual:pwa-register";

type Ecouteur = () => void;
let installation: (Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> }) | null = null;
let majDisponible: ((recharger?: boolean) => Promise<void>) | null = null;
const ecouteurs = new Set<Ecouteur>();
const signaler = () => ecouteurs.forEach((f) => f());

export function demarrerPwa() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installation = e as typeof installation;
    signaler();
  });
  window.addEventListener("appinstalled", () => { installation = null; signaler(); });
  const maj = registerSW({
    onNeedRefresh() { majDisponible = maj; signaler(); },
  });
}

export const etatPwa = () => ({
  installable: !!installation,
  miseAJour: !!majDisponible,
  dejaInstallee: window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true,
  ios: /iphone|ipad|ipod/i.test(navigator.userAgent),
});
export async function installer() { if (installation) { await installation.prompt(); installation = null; signaler(); } }
export async function appliquerMiseAJour() { await majDisponible?.(true); }
export function surPwa(f: Ecouteur) { ecouteurs.add(f); return () => { ecouteurs.delete(f); }; }
