require('dotenv').config();
const pool = require('./config');
const cron = require('node-cron');
const { smtpTrans } = require('./mail_utils');
const { DateTime } = require('luxon');

/**
 * IMPORTANT :
 * - Le cron tourne dans le timezone du serveur.
 * - Si tu veux être sûr du timezone (ex: Quebec), mets timezone: 'America/Toronto'
 *   Si tu veux Madagascar: 'Indian/Antananarivo'
 */
cron.schedule(
    '0 8 * * *',
    async () => {
        try {
            await envoiNotification();
        } catch (err) {
            console.error("Erreur cron envoiNotification:", err);
        }
    },
    {
        timezone: process.env.CRON_TZ || 'America/Toronto', // mets ce que tu veux
    }
);

// envoiNotification();

async function envoiNotification() {
    // today ISO date (YYYY-MM-DD)
    const today = DateTime.now().toISODate();
    // const today = '2026-02-21';

    const query = `
    select *,
           date_debut::text as date_debut,
           date_fin::text as date_fin
    from public.planning_notification
    where date_notif = $1
  `;
    const { rows: data } = await pool.query(query, [today]);

    if (!data || data.length === 0) {
        console.log(`[notif] Aucune notification à envoyer pour ${today}`);
        return;
    }

    const query_get_param = `
    select *
    from public.parametrage_notification
    where id_param_notification = 1
  `;
    const { rows: data_param } = await pool.query(query_get_param);

    if (!data_param || data_param.length === 0) {
        console.log("[notif] Paramétrage introuvable (id_param_notification = 1)");
        return;
    }

    const is_notification = !!data_param[0].notification;
    const is_responsable = !!data_param[0].responsable;

    if (!is_notification) {
        console.log("[notif] Notifications désactivées via parametrage_notification.notification");
        return;
    }

    // Traitement séquentiel (safe DB + logs + updates)
    for (const element of data) {
        try {
            // --- CC de base ---
            let courriel_cc = [];
            try {
                const autres = JSON.parse(data_param[0].autre_courriel || "[]");
                courriel_cc = (autres || []).map(a => a.courriel).filter(Boolean);
            } catch (e) {
                courriel_cc = [];
            }

            // --- Travailleur ---
            const query_travailleur = `select * from public."fichier_travailleur" where id_travailleur = $1`;
            const { rows: data_travailleur } = await pool.query(query_travailleur, [element.id_travailleur]);

            if (!data_travailleur || data_travailleur.length === 0) {
                console.log(`[notif] Travailleur introuvable id_travailleur=${element.id_travailleur}`);
                await updateNextNotifSafe(element, null);
                continue;
            }

            const courriel_travailleur = data_travailleur[0].courriel_travailleur ?? data_travailleur[0].email_perso;
            if (!courriel_travailleur) {
                console.log(`[notif] Email travailleur vide id_travailleur=${element.id_travailleur}`);
                await updateNextNotifSafe(element, null);
                continue;
            }

            const nom_travailleur = data_travailleur[0].nom_user || '';
            const prenom_travailleur = data_travailleur[0].prenom_user || '';
            const nom_complet = `${prenom_travailleur} ${nom_travailleur}`.trim();

            // --- Responsables en CC ---
            if (is_responsable) {
                const data_responsable = data_travailleur[0].id_user_responsable;

                if (data_responsable != null && data_responsable !== "") {
                    let responsables = [];
                    try {
                        responsables = JSON.parse(data_responsable);
                    } catch (e) {
                        responsables = [];
                    }

                    const promises = responsables.map(async (id_user) => {
                        const query_courriel_manager = `select "user" from public."user" where id_user = $1`;
                        const { rows: data_courriel } = await pool.query(query_courriel_manager, [id_user]);
                        const courriel_manager = data_courriel[0]?.user;
                        return courriel_manager || null;
                    });

                    const managersEmails = (await Promise.all(promises)).filter(Boolean);
                    courriel_cc.push(...managersEmails);
                }
            }

            // Dédoublonnage CC + enlever le "to" si par hasard
            courriel_cc = uniqEmails(courriel_cc).filter(e => e !== courriel_travailleur);

            // --- HTML mail ---
            const html = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
          <p style="margin-bottom: 20px;"><strong>Bonjour ${nom_complet},</strong></p>
          
          <!-- FRENCH VERSION -->
          <h2 style="color: #1a73e8; margin-bottom: 15px;">Avertissement pour déplacements routiers</h2>
          
          <h3 style="color: #1a73e8; font-size: 13px; margin-top: 15px; margin-bottom: 10px;">Déplacements vers le site Galaxy</h3>
          <p>
            Appelez au
            <a href="tel:8193459954" style="color:#1a73e8; text-decoration: none;"><strong>819-345-9954</strong></a>
          </p>
          <ul style="margin-top: 10px; margin-bottom: 10px;">
            <li>En entrant sur la route Billy Diamond à Matagami ou sur la Route du Nord à Chibougamau ou au moment de quitter une communauté sur le territoire Cri de la Baie-James.</li>
            <li>En arrivant au Relais Routier 381 ou au site de la mine Galaxy</li>
          </ul>

          <h3 style="color: #1a73e8; font-size: 13px; margin-top: 15px; margin-bottom: 10px;">Déplacement hors du site Galaxy</h3>
          <p>
            Appelez au
            <a href="tel:8193459954" style="color:#1a73e8; text-decoration: none;"><strong>819-345-9954</strong></a>
          </p>
          <ul style="margin-top: 10px; margin-bottom: 10px;">
            <li>Avant de quitter le site de la mine ou le Relais Routier 381.</li>
            <li>Au moment de quitter la route Billy Diamond à Matagami ou en quittant la Route du Nord à Chibougamau ou en arrivant dans une communauté sur le territoire Cri de la Baie-James.</li>
          </ul>

          <p style="margin-top: 15px;"><strong>Mentionnez à l'agent de sureté les informations suivantes :</strong></p>
          <ul style="margin-top: 10px; margin-bottom: 15px;">
            <li>Nom complet de tous les occupants du véhicule.</li>
            <li>Localisation actuelle</li>
            <li>Le numéro de voyage fournit par les responsables Rio Tinto</li>
          </ul>

          <hr style="margin: 30px 0; border: none; border-top: 2px solid #ccc;" />

          <!-- ENGLISH VERSION -->
          <h2 style="color: #1a73e8; margin-top: 20px; margin-bottom: 15px;">Warning for Road Travel</h2>
          
          <h3 style="color: #1a73e8; font-size: 13px; margin-top: 15px; margin-bottom: 10px;">Trips to the Galaxy Site</h3>
          <p>
            Call
            <a href="tel:8193459954" style="color:#1a73e8; text-decoration: none;"><strong>819-345-9954</strong></a>
          </p>
          <ul style="margin-top: 10px; margin-bottom: 10px;">
            <li>When entering the Billy Diamond Road in Matagami or the Route du Nord in Chibougamau or when leaving a community in the Cree territory of James Bay.</li>
            <li>Arriving at Truck Stop 381 or the Galaxy Mine site.</li>
          </ul>

          <h3 style="color: #1a73e8; font-size: 13px; margin-top: 15px; margin-bottom: 10px;">Moving Out of the Galaxy Site</h3>
          <p>
            Call
            <a href="tel:8193459954" style="color:#1a73e8; text-decoration: none;"><strong>819-345-9954</strong></a>
          </p>
          <ul style="margin-top: 10px; margin-bottom: 10px;">
            <li>Before leaving the mine site or Truck Stop 381.</li>
            <li>When leaving Billy Diamond Road in Matagami or when leaving the Route du Nord in Chibougamau or arriving in a community on James Bay Cree territory.</li>
          </ul>

          <p style="margin-top: 15px;"><strong>Tell the security officer the following information:</strong></p>
          <ul style="margin-top: 10px; margin-bottom: 15px;">
            <li>Full names of all occupants of the vehicle.</li>
            <li>Current location.</li>
            <li>The trip number provided by Rio Tinto officials.</li>
          </ul>
        </div>
      `;

            const mailData = {
                from: '"Galaxy Hub Construction" <notifications@constructiongalaxyhub.com>',
                to: courriel_travailleur,
                cc: courriel_cc.length ? courriel_cc : undefined,
                subject: `Consigne de déplacement routier / Road Travel Instruction`,
                html,
            };

            console.log("[notif] Envoi mail:", {
                to: mailData.to,
                ccCount: courriel_cc.length,
                id_planning: element.id_planning,
            });

            // Envoi mail (attendu)
            await smtpTrans.sendMail(mailData);
            console.log("[notif] Notification envoyée");

            // --- Calcul prochaine notification ---
            const date_debut = element.date_debut;
            const date_fin = element.date_fin;
            const rotation = element.rotation;      // ex: "14/14" ou "0"
            const jour_arrive = element.jour_arrive; // 1=Lundi ... 7=Dimanche

            const nextDate = getNextNotification({
                date_debut,
                date_fin,
                rotation,
                jour_arrive,
                today,
                daysBefore: 2, // <= J-2
            });

            // Update date_notif
            await updateNextNotifSafe(element, nextDate);

        } catch (err) {
            console.error("[notif] Erreur traitement element:", {
                id_planning: element?.id_planning,
                id_travailleur: element?.id_travailleur,
                err: err?.message || err,
            });

            // En cas d'erreur, on évite de bloquer tout le lot.
            // Tu peux décider de ne pas update dans ce cas si tu veux.
        }
    }
}

async function updateNextNotifSafe(element, nextDate) {
    const query_update = `update public.planning_notification set date_notif = $1 where id_planning = $2`;
    await pool.query(query_update, [nextDate, element.id_planning]);

    console.log("[notif] date_notif updated:", {
        id_planning: element.id_planning,
        next: nextDate,
    });
}

/**
 * Calcule la prochaine date_notif à partir des règles:
 * - Arrivée - 2 jours
 * - Jour J arrivée
 * - Départ - 2 jours
 * - Jour J départ
 *
 * Rotation:
 * - arrivalDate: jour_arrive trouvé dans le cycle
 * - departDate : arrivalDate + onDays - 1 (dernier jour "ON")
 */
function getNextNotification({ date_debut, date_fin, rotation, jour_arrive, today = null, daysBefore = 2 }) {
    const start = DateTime.fromISO(date_debut).startOf("day");
    const end = DateTime.fromISO(date_fin).startOf("day");
    const now = (today ? DateTime.fromISO(today) : DateTime.now()).startOf("day");

    const candidates = [];

    const pushIfValid = (dt) => {
        if (!dt || !dt.isValid) return;
        // on garde des dates raisonnables
        if (dt <= end.plus({ days: 365 })) candidates.push(dt);
    };

    // --- CAS SANS ROTATION ---
    // Ici: arrivée = date_debut, départ = date_fin
    if (rotation === "0" || rotation === 0 || rotation == null) {
        const arrival = start;
        const depart = end;

        pushIfValid(arrival.minus({ days: daysBefore }));
        pushIfValid(arrival);
        pushIfValid(depart.minus({ days: daysBefore }));
        pushIfValid(depart);

        return pickNextIso(candidates, now);
    }

    // --- PARSE ROTATION ---
    const [onDays, offDays] = String(rotation).split("/").map(Number);
    if (!Number.isFinite(onDays) || !Number.isFinite(offDays) || onDays <= 0) {
        // rotation invalide => fallback
        const arrival = start;
        const depart = end;

        pushIfValid(arrival.minus({ days: daysBefore }));
        pushIfValid(arrival);
        pushIfValid(depart.minus({ days: daysBefore }));
        pushIfValid(depart);

        return pickNextIso(candidates, now);
    }

    const cycleLength = onDays + offDays;
    let cycleStart = start;

    while (cycleStart <= end) {
        // 1) Trouver arrivalDate sur le jour_arrive dans ce cycle
        const arrivalTarget = parseInt(jour_arrive, 10); // 1=Lundi ... 7=Dimanche
        let arrivalDate = cycleStart;

        while (arrivalDate.weekday !== arrivalTarget) {
            arrivalDate = arrivalDate.plus({ days: 1 });
            if (arrivalDate > end) break;
        }
        if (arrivalDate > end) break;

        // 2) departDate = dernier jour ON
        const departDate = arrivalDate.plus({ days: onDays - 1 });
        const departSafe = departDate <= end ? departDate : end;

        // 3) Les 4 notifications
        pushIfValid(arrivalDate.minus({ days: daysBefore }));
        pushIfValid(arrivalDate);
        pushIfValid(departSafe.minus({ days: daysBefore }));
        pushIfValid(departSafe);

        // 4) Si on a un futur, on retourne direct
        const next = pickNextIso(candidates, now);
        if (next) return next;

        cycleStart = cycleStart.plus({ days: cycleLength });
    }

    return null;
}

function pickNextIso(candidates, now) {
    const next = candidates
        .filter(d => d > now)
        .sort((a, b) => a.toMillis() - b.toMillis())[0];
    return next ? next.toISODate() : null;
}

function uniqEmails(list) {
    const set = new Set();
    for (const e of (list || [])) {
        const clean = String(e || "").trim().toLowerCase();
        if (!clean) continue;
        set.add(clean);
    }
    return [...set];
}
