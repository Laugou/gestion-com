import type { Api } from "./api";
import { creerApiDemo } from "./demoApi";
import { creerApiSupabase } from "./supabaseApi";

declare const __MODE_DEMO__: boolean;

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const cle = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Mode démonstration : build « demo », ou poste de développement sans configuration Supabase. */
export const MODE_DEMO = __MODE_DEMO__ || (import.meta.env.DEV && (!url || !cle));
/** Version de production livrée sans adresse Supabase : on affiche une erreur plutôt qu'une démo. */
export const CONFIG_MANQUANTE = !MODE_DEMO && (!url || !cle);

export const api: Api = MODE_DEMO || CONFIG_MANQUANTE ? creerApiDemo() : creerApiSupabase(url!, cle!);

export type ApiDemo = Api & { changerUtilisateurDemo: (id: string) => void; reinitialiserDemo: () => void };
export { ErreurApp } from "./api";
