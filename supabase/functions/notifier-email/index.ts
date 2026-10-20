// Envoi par courriel des notifications (facultatif).
// Déclenché par un « Database Webhook » Supabase sur l'insertion dans la table notifications.
// Prestataire d'envoi : Brevo (société française). Sans clé BREVO_API_KEY, rien n'est envoyé :
// les notifications restent visibles dans l'application.
import { clientService, APP_URL } from "../_shared/commun.ts";

const echapper = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  // Le webhook doit présenter le secret partagé.
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) return new Response("Refusé", { status: 401 });

  const cle = Deno.env.get("BREVO_API_KEY");
  if (!cle) return Response.json({ ignore: "BREVO_API_KEY absente" });

  const charge = await req.json().catch(() => null);
  const notif = charge?.record;
  if (charge?.type !== "INSERT" || !notif?.destinataire_id) return Response.json({ ignore: "charge inattendue" });

  const service = clientService();
  const { data: dest } = await service.from("profils")
    .select("email, nom, actif, notif_email").eq("id", notif.destinataire_id).single();
  if (!dest?.actif || !dest.notif_email || !dest.email) return Response.json({ ignore: "destinataire sans courriel" });

  const lien = notif.publication_id ? `${APP_URL}/publication/${notif.publication_id}` : `${APP_URL}/`;
  const objets: Record<string, string> = {
    a_valider: "Publication à valider",
    validee: "Publication validée",
    renvoyee: "Publication renvoyée avec remarques",
    commentaire: "Nouveau commentaire",
    rappel: "Rappel",
  };
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#15233B">
    <p>Bonjour ${echapper(dest.nom || "")},</p>
    <p>${echapper(notif.message)}</p>
    <p><a href="${lien}" style="background:#1A3C6E;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Ouvrir dans Gestion COM</a></p>
    <p style="color:#5A6577;font-size:12px">Commune de Cabannes — service VACC. Vous pouvez couper ces courriels dans « Mon compte ».</p></div>`;

  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": cle, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: Deno.env.get("EXPEDITEUR_EMAIL"), name: Deno.env.get("EXPEDITEUR_NOM") ?? "Gestion COM Cabannes" },
      to: [{ email: dest.email, name: dest.nom }],
      subject: `[Gestion COM] ${objets[notif.type] ?? "Notification"}`,
      htmlContent: html,
    }),
  });
  if (!r.ok) return new Response("Échec d'envoi : " + (await r.text()), { status: 502 });
  await service.from("notifications").update({ email_envoye: true }).eq("id", notif.id);
  return Response.json({ envoye: true });
});
