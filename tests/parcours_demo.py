"""Parcours automatisé sur la version de démonstration : connexion par rôle, circuit de
validation complet, captures ordinateur et téléphone. Usage : python3 tests/parcours_demo.py SORTIE"""
import sys, pathlib
from playwright.sync_api import sync_playwright

RACINE = pathlib.Path(__file__).resolve().parent.parent
PAGE = (RACINE / "app/dist-demo/index.html").as_uri()
SORTIE = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/captures"); SORTIE.mkdir(parents=True, exist_ok=True)
erreurs = []
resultats = []

def verifier(nom, cond):
    resultats.append((nom, bool(cond)))

def connecter(page, email):
    page.goto(PAGE); page.evaluate("localStorage.clear()") if email == "reset" else None
    page.fill("#c-email", email); page.click("button:has-text('Se connecter')")
    page.wait_for_selector("text=Tableau de bord", timeout=8000)

with sync_playwright() as p:
    nav = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    for (nom, w, h, mobile, theme) in [("ordinateur", 1366, 900, False, "light"), ("telephone", 390, 844, True, "light"), ("telephone-sombre", 390, 844, True, "dark")]:
        ctx = nav.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, has_touch=mobile, color_scheme=theme, device_scale_factor=1)
        page = ctx.new_page()
        page.on("pageerror", lambda e: erreurs.append(str(e)))
        page.on("console", lambda m: erreurs.append(m.text) if m.type == "error" else None)
        page.goto(PAGE); page.evaluate("localStorage.clear()"); page.reload()
        page.screenshot(path=str(SORTIE / f"{nom}-0-connexion.png"))
        page.fill("#c-email", "communication@exemple.fr"); page.click("button:has-text('Se connecter')")
        page.wait_for_selector("h1:has-text('Tableau de bord')", timeout=8000)
        page.screenshot(path=str(SORTIE / f"{nom}-1-tableau.png"), full_page=True)
        # Débordement horizontal
        verifier(f"{nom} : pas de défilement horizontal (tableau de bord)", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
        for lien, fichier in [("Planning", "2-planning"), ("Validation", "3-validation"), ("Stats" if mobile else "Statistiques", "4-statistiques")]:
            page.locator(f"{'.onglets' if mobile else '.lateral'} >> text={lien}").first.click(); page.wait_for_timeout(300)
            page.screenshot(path=str(SORTIE / f"{nom}-{fichier}.png"), full_page=True)
            verifier(f"{nom} : pas de défilement horizontal ({lien})", page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
        if nom != "ordinateur":
            ctx.close(); continue

        # ---- Parcours complet sur ordinateur ----
        page.locator("nav >> text=Tableau de bord").first.click(); page.wait_for_timeout(200)
        page.click("text=Nouvelle publication"); page.wait_for_selector("#p-titre")
        page.fill("#p-titre", "Test automatisé : loto des écoles")
        page.fill("#p-texte", "Grand loto des écoles samedi à la salle des fêtes.")
        page.locator(".choix-canaux label", has_text="Facebook").click()
        page.locator(".choix-canaux label", has_text="Instagram").click()
        page.click("button:has-text('Relire')"); page.wait_for_selector(".assistant .sortie >> text=Version corrigée", timeout=5000)
        verifier("Assistant (démo) répond", True)
        page.screenshot(path=str(SORTIE / "ordinateur-5-fiche.png"), full_page=True)
        page.click("button:has-text('Demander la validation')"); page.wait_for_url("**", timeout=3000); page.wait_for_timeout(500)
        verifier("Rédacteur : envoi en validation", page.locator(".panneau h2 >> text=À valider").count() > 0)
        verifier("Rédacteur : pas de bouton Valider", page.locator("button:has-text('Valider')").count() == 0)
        # Bascule vers l'élu valideur
        page.select_option("#demo-role", label="Élu délégué (Valideur)"); page.wait_for_timeout(400)
        page.locator("nav >> text=Notifications").first.click(); page.wait_for_timeout(300)
        verifier("Valideur : notifié de la demande", page.locator("text=Test automatisé : loto des écoles").count() > 0)
        page.locator(".notif", has_text="loto des écoles").first.click(); page.wait_for_selector("button:has-text('Renvoyer avec remarques')")
        page.click("button:has-text('Renvoyer avec remarques')"); page.fill("#motif", "Préciser l'heure du loto.")
        page.click(".dialogue button:has-text('Renvoyer')"); page.wait_for_timeout(500)
        verifier("Valideur : renvoi avec motif", page.locator(".bandeau >> text=Préciser l'heure du loto.").count() > 0)
        # Retour rédacteur : corrige et renvoie
        page.select_option("#demo-role", label="Agent communication (Rédacteur)"); page.wait_for_timeout(400)
        page.locator("nav >> text=Notifications").first.click(); page.wait_for_timeout(300)
        verifier("Rédacteur : notifié du renvoi", page.locator("text=vous est renvoyée").count() > 0)
        page.locator(".notif", has_text="renvoyée").first.click(); page.wait_for_selector("#p-texte")
        page.fill("#p-texte", "Grand loto des écoles samedi à 14 h à la salle des fêtes.")
        page.click("button:has-text('Demander la validation')"); page.wait_for_timeout(500)
        page.select_option("#demo-role", label="Élu délégué (Valideur)"); page.wait_for_timeout(400)
        page.locator("nav >> text=Validation").first.click(); page.wait_for_timeout(300)
        page.locator(".carte", has_text="loto des écoles").locator("text=Examiner et valider").click()
        page.click("button.succes:has-text('Valider')"); page.wait_for_timeout(500)
        verifier("Valideur : validation enregistrée", page.locator("text=Validée par").count() > 0)
        # Diffusion directe : Facebook part (simulé), Instagram refuse faute de visuel JPEG
        page.click(".diffusion button:has-text('Publier maintenant')"); page.click(".diffusion button:has-text('Oui, publier')")
        page.wait_for_selector(".diffusion .ko", timeout=5000)
        verifier("Diffusion : Facebook publié", page.locator(".diffusion li", has_text="Facebook").locator(".ok").count() == 1)
        verifier("Diffusion : Instagram refusé sans visuel, motif affiché", page.locator(".diffusion .ko", has_text="Instagram exige un visuel").count() == 1)
        verifier("Diffusion : bouton restant limité à Instagram", page.locator(".diffusion button:has-text('Publier maintenant sur Instagram')").count() == 1)
        page.screenshot(path=str(SORTIE / "ordinateur-5b-diffusion.png"), full_page=True)
        # Le rédacteur modifie un texte validé : retour automatique en validation
        page.select_option("#demo-role", label="Agent communication (Rédacteur)"); page.wait_for_timeout(400)
        page.locator("nav >> text=Validation").first.click(); page.wait_for_timeout(300)
        page.locator(".carte", has_text="loto des écoles").locator(".titre").click(); page.wait_for_selector("#p-texte")
        page.fill("#p-texte", "Grand loto des écoles samedi à 14 h, salle des fêtes. Buvette sur place.")
        page.click(".barre-actions button:has-text('Enregistrer')"); page.wait_for_timeout(600)
        verifier("Texte validé modifié : repart en validation", page.locator(".panneau h2 .etape", has_text="À valider").count() > 0)
        # Lecteur : lecture seule mais peut commenter
        page.select_option("#demo-role", label="Direction générale (Lecteur)"); page.wait_for_timeout(400)
        page.locator(".lateral >> text=Planning").click(); page.wait_for_timeout(200)
        page.locator(".ligne", has_text="loto").first.click(); page.wait_for_selector("#p-titre")
        verifier("Lecteur : champs verrouillés", page.is_disabled("#p-titre"))
        verifier("Lecteur : pas de bouton Enregistrer", page.locator("button:has-text('Enregistrer')").count() == 0)
        page.fill("#com", "Vu, merci."); page.click("button:has-text('Envoyer')"); page.wait_for_timeout(300)
        verifier("Lecteur : commentaire publié", page.locator(".message >> text=Vu, merci.").count() > 0)
        verifier("Lecteur : pas d'accès Administration", page.locator("nav >> text=Administration").count() == 0)
        # Administrateur
        page.select_option("#demo-role", label="Responsable VACC (Administrateur)"); page.wait_for_timeout(400)
        page.locator("nav >> text=Administration").first.click(); page.wait_for_selector("#i-email")
        page.fill("#i-nom", "Nouvelle Recrue"); page.fill("#i-email", "recrue@exemple.fr"); page.click("button:has-text('Inviter')"); page.wait_for_timeout(400)
        verifier("Admin : création de compte", page.locator("text=recrue@exemple.fr").count() > 0)
        page.click("button:has-text('Tester la connexion aux comptes')"); page.wait_for_selector(".etat-reseaux", timeout=5000)
        verifier("Admin : test de connexion aux réseaux affiché", page.locator(".etat-reseaux >> text=aucun compte réel").count() == 2)
        verifier("Admin : Facebook relié au canal Facebook", page.eval_on_selector("#res-facebook", "e => e.selectedOptions[0].text") == "Facebook")
        page.screenshot(path=str(SORTIE / "ordinateur-6-administration.png"), full_page=True)
        page.locator("nav >> text=Événements").first.click(); page.wait_for_timeout(300)
        page.screenshot(path=str(SORTIE / "ordinateur-7-evenements.png"), full_page=True)
        ctx.close()
    nav.close()

for n, ok in resultats: print(("OK    " if ok else "ÉCHEC ") + n)
print(f"{sum(o for _, o in resultats)}/{len(resultats)} vérifications réussies")
print("Erreurs console :", erreurs[:10] if erreurs else "aucune")
