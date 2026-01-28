// require('dotenv').config();
// const pool = require('./config');
// const cron = require('node-cron');
// const { smtpTrans } = require('./mail_utils');
// const { DateTime } = require('luxon');

// // Toutes les jours à 8h
// cron.schedule('0 8 * * *', () => {
//     envoiNotification()
// });

// async function envoiNotification() {
//     const today = DateTime.now().toISODate()
//     // const today = "2026-01-24"
//     let query = `select *, date_debut::text as date_debut, date_fin::text as date_fin from public.planning_notification where date_notif = $1`
//     let { rows: data } = await pool.query(query, [today])
//     if (data.length > 0) {

//         let query_get_param = `select * from public.parametrage_notification where id_param_notification = 1`
//         let { rows: data_param } = await pool.query(query_get_param)
//         let is_notification = data_param[0].notification
//         let is_responsable = data_param[0].responsable

//         if (is_notification) {
//             data.forEach(async element => {
//                 let courriel_cc = JSON.parse(data_param[0].autre_courriel).map(a => a.courriel)
//                 let query_travailleur = `select * from public."fichier_travailleur" where id_travailleur = $1`;
//                 let { rows: data_travailleur } = await pool.query(query_travailleur, [element.id_travailleur]);
//                 const courriel_travailleur = data_travailleur[0].user
//                 if (is_responsable) {
//                     let data_responsable = data_travailleur[0].id_user_responsable;

//                     if (data_responsable != null && data_responsable !== "") {
//                         let responsables = JSON.parse(data_responsable);

//                         let promises = responsables.map(async (t) => {
//                             let query_courriel_manager = `select "user" from public."user" where id_user = $1`;
//                             let { rows: data_courriel } = await pool.query(query_courriel_manager, [t]);
//                             let courriel_manager = data_courriel[0]?.user;

//                             if (courriel_manager) {
//                                 courriel_cc.push(courriel_manager);
//                             }
//                         });

//                         await Promise.all(promises);
//                     }
//                 }

//                 const html = `
//                     <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">

//                         <!-- VERSION FRANÇAISE -->
//                         <p><strong>Avertissement pour déplacement routiers</strong></p>

//                         <p>
//                         Textez ou appelez au
//                         <a href="tel:8193459954" style="color:#1a73e8; text-decoration: none;">819-345-9954</a>
//                         </p>

//                         <ul style="margin-top: 10px; margin-bottom: 10px;">
//                         <li>Avant votre départ (du jour 1 et 2)</li>
//                         <li>En entrant sur la route Billy Diamond (Matagami) ou destination du jour 1</li>
//                         <li>En arrivant au Relais 381 ou à votre destination finale</li>
//                         </ul>

//                         <p>SVP veuillez vous référer au Memo du Plan de voyagement</p>
//                         <p>Mentionnez toujours votre <strong>NOM</strong> et votre <strong>LOCALISATION ACTUELLE</strong></p>
//                         <p>Veuillez vous enregistrer à la réception du Relais 381 dès votre arrivée</p>

//                         <hr style="margin: 20px 0; border: none; border-top: 1px solid #ccc;" />

//                         <!-- ENGLISH VERSION -->
//                         <p><strong>Warning for Road Travel</strong></p>

//                         <p>
//                         Text or call
//                         <a href="tel:8193459954" style="color:#1a73e8; text-decoration: none;">819-345-9954</a>
//                         </p>

//                         <ul style="margin-top: 10px; margin-bottom: 10px;">
//                         <li>Before your departure (days 1 and 2)</li>
//                         <li>When entering the Billy Diamond Highway (Matagami) or your day-1 destination</li>
//                         <li>When arriving at Relais 381 or at your final destination</li>
//                         </ul>

//                         <p>Please refer to the Travel Plan Memo</p>
//                         <p>Always mention your <strong>NAME</strong> and your <strong>CURRENT LOCATION</strong></p>
//                         <p>Please check in at the Relais 381 reception upon arrival</p>

//                     </div>
//                 `;

//                 const mailData = {
//                     from: '"Galaxy Hub Construction" <notifications@constructiongalaxyhub.com>',
//                     to: courriel_travailleur,
//                     cc: courriel_cc,
//                     subject: `Road Travel Instruction / Consigne de déplacement routier`,
//                     html
//                 };

//                 console.log(mailData)

//                 smtpTrans.sendMail(mailData)
//                     .then(() => console.log("Notification envoyée"))
//                     .catch(err => console.error("Erreur d'envoi de mail:", err));

//                 let date_debut = element.date_debut
//                 let date_fin = element.date_fin
//                 let rotation = element.rotation
//                 let jour_arrive = element.jour_arrive
//                 const date_notification = getNextNotification({ date_debut, date_fin, rotation, jour_arrive, today })
//                 let query_update = `update public.planning_notification set date_notif = $1 where id_planning = $2`
//                 await pool.query(query_update, [date_notification, element.id_planning])
//             })
//         }
//     }
// }

// function getNextNotification({ date_debut, date_fin, rotation, jour_arrive, today = null }) {
//     const start = DateTime.fromISO(date_debut);
//     const end = DateTime.fromISO(date_fin);
//     const now = today ? DateTime.fromISO(today) : DateTime.now();

//     // --- CAS SANS ROTATION ---
//     if (rotation === "0") {
//         const notif = start.minus({ days: 2 });
//         return notif > now ? notif.toISODate() : null;
//     }

//     // --- PARSE ROTATION ---
//     const [onDays, offDays] = rotation.split("/").map(Number);
//     const cycleLength = onDays + offDays;

//     let cycleStart = start;

//     // On boucle cycle par cycle jusqu'à dépasser fin
//     while (cycleStart <= end) {
//         // Trouver le jour d’arrivée de CE cycle
//         const arrivalTarget = parseInt(jour_arrive, 10); // 1=Lundi
//         let arrivalDate = cycleStart;

//         // Avancer jusqu'au bon jour de semaine
//         while (arrivalDate.weekday !== arrivalTarget) {
//             arrivalDate = arrivalDate.plus({ days: 1 });
//             if (arrivalDate > end) break;
//         }

//         if (arrivalDate > end) break;

//         // Calcul notification J-2
//         const notifDate = arrivalDate.minus({ days: 2 });

//         // On retourne la première notification future
//         if (notifDate > now) {
//             return notifDate.toISODate();
//         }

//         // Passer au cycle suivant
//         cycleStart = cycleStart.plus({ days: cycleLength });
//     }

//     // Aucune notification future dans la période
//     return null;
// }


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
    // const today = '2026-02-22';

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

            const courriel_travailleur = data_travailleur[0].user;
            if (!courriel_travailleur) {
                console.log(`[notif] Email travailleur vide id_travailleur=${element.id_travailleur}`);
                await updateNextNotifSafe(element, null);
                continue;
            }

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

          <!-- VERSION FRANÇAISE -->
          <p><strong>Avertissement pour déplacement routiers</strong></p>

          <p>
            Textez ou appelez au
            <a href="tel:8193459954" style="color:#1a73e8; text-decoration: none;">819-345-9954</a>
          </p>

          <ul style="margin-top: 10px; margin-bottom: 10px;">
            <li>Avant votre départ (du jour 1 et 2)</li>
            <li>En entrant sur la route Billy Diamond (Matagami) ou destination du jour 1</li>
            <li>En arrivant au Relais 381 ou à votre destination finale</li>
          </ul>

          <p>SVP veuillez vous référer au Memo du Plan de voyagement</p>
          <p>Mentionnez toujours votre <strong>NOM</strong> et votre <strong>LOCALISATION ACTUELLE</strong></p>
          <p>Veuillez vous enregistrer à la réception du Relais 381 dès votre arrivée</p>

          <hr style="margin: 20px 0; border: none; border-top: 1px solid #ccc;" />

          <!-- ENGLISH VERSION -->
          <p><strong>Warning for Road Travel</strong></p>

          <p>
            Text or call
            <a href="tel:8193459954" style="color:#1a73e8; text-decoration: none;">819-345-9954</a>
          </p>

          <ul style="margin-top: 10px; margin-bottom: 10px;">
            <li>Before your departure (days 1 and 2)</li>
            <li>When entering the Billy Diamond Highway (Matagami) or your day-1 destination</li>
            <li>When arriving at Relais 381 or at your final destination</li>
          </ul>

          <p>Please refer to the Travel Plan Memo</p>
          <p>Always mention your <strong>NAME</strong> and your <strong>CURRENT LOCATION</strong></p>
          <p>Please check in at the Relais 381 reception upon arrival</p>
        </div>
      `;

            const mailData = {
                from: '"Galaxy Hub Construction" <notifications@constructiongalaxyhub.com>',
                to: courriel_travailleur,
                cc: courriel_cc.length ? courriel_cc : undefined,
                subject: `Road Travel Instruction / Consigne de déplacement routier`,
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
