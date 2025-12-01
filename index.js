require('dotenv').config();
const pool = require('./config');
const cron = require('node-cron');
const { smtpTrans } = require('./mail_utils');
const { DateTime } = require('luxon');

// Toutes les jours à 8h
cron.schedule('0 8 * * *', () => {
    envoiNotification()
});

async function envoiNotification() {
    const today = DateTime.now().toISODate()
    // const today = "2026-01-24"
    let query = `select *, date_debut::text as date_debut, date_fin::text as date_fin from public.planning_notification where date_notif = $1`
    let { rows: data } = await pool.query(query, [today])
    if (data.length > 0) {

        let query_get_param = `select * from public.parametrage_notification where id_param_notification = 1`
        let { rows: data_param } = await pool.query(query_get_param)
        let is_notification = data_param[0].notification
        let is_responsable = data_param[0].responsable

        if (is_notification) {
            data.forEach(async element => {
                let courriel_cc = JSON.parse(data_param[0].autre_courriel).map(a => a.courriel)
                let query_travailleur = `select * from public."fichier_travailleur" where id_travailleur = $1`;
                let { rows: data_travailleur } = await pool.query(query_travailleur, [element.id_travailleur]);
                const courriel_travailleur = data_travailleur[0].user
                if (is_responsable) {
                    let data_responsable = data_travailleur[0].id_user_responsable;

                    if (data_responsable != null && data_responsable !== "") {
                        let responsables = JSON.parse(data_responsable);

                        let promises = responsables.map(async (t) => {
                            let query_courriel_manager = `select "user" from public."user" where id_user = $1`;
                            let { rows: data_courriel } = await pool.query(query_courriel_manager, [t]);
                            let courriel_manager = data_courriel[0]?.user;

                            if (courriel_manager) {
                                courriel_cc.push(courriel_manager);
                            }
                        });

                        await Promise.all(promises);
                    }
                }

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
                    cc: courriel_cc,
                    subject: `Road Travel Instruction / Consigne de déplacement routier`,
                    html
                };

                console.log(mailData)

                smtpTrans.sendMail(mailData)
                    .then(() => console.log("Notification envoyée"))
                    .catch(err => console.error("Erreur d'envoi de mail:", err));

                let date_debut = element.date_debut
                let date_fin = element.date_fin
                let rotation = element.rotation
                let jour_arrive = element.jour_arrive
                const date_notification = getNextNotification({ date_debut, date_fin, rotation, jour_arrive, today })
                let query_update = `update public.planning_notification set date_notif = $1 where id_planning = $2`
                await pool.query(query_update, [date_notification, element.id_planning])
            })
        }
    }
}

function getNextNotification({ date_debut, date_fin, rotation, jour_arrive, today = null }) {
    const start = DateTime.fromISO(date_debut);
    const end = DateTime.fromISO(date_fin);
    const now = today ? DateTime.fromISO(today) : DateTime.now();

    // --- CAS SANS ROTATION ---
    if (rotation === "0") {
        const notif = start.minus({ days: 2 });
        return notif > now ? notif.toISODate() : null;
    }

    // --- PARSE ROTATION ---
    const [onDays, offDays] = rotation.split("/").map(Number);
    const cycleLength = onDays + offDays;

    let cycleStart = start;

    // On boucle cycle par cycle jusqu'à dépasser fin
    while (cycleStart <= end) {
        // Trouver le jour d’arrivée de CE cycle
        const arrivalTarget = parseInt(jour_arrive, 10); // 1=Lundi
        let arrivalDate = cycleStart;

        // Avancer jusqu'au bon jour de semaine
        while (arrivalDate.weekday !== arrivalTarget) {
            arrivalDate = arrivalDate.plus({ days: 1 });
            if (arrivalDate > end) break;
        }

        if (arrivalDate > end) break;

        // Calcul notification J-2
        const notifDate = arrivalDate.minus({ days: 2 });

        // On retourne la première notification future
        if (notifDate > now) {
            return notifDate.toISODate();
        }

        // Passer au cycle suivant
        cycleStart = cycleStart.plus({ days: cycleLength });
    }

    // Aucune notification future dans la période
    return null;
}