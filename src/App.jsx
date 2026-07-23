import React, { useState, useEffect } from "react";
import { Shirt, ClipboardList, ShoppingCart, Plus, Trash2, Users, Check, History, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "./lib/supabaseClient";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');
`;

const PALETTE = ["#6B8F71", "#5B7FA6", "#C99A2E", "#8B5A7C", "#A8503B", "#3F8C82"];
const EDIT_PIN = "fTKPfvWsJOv97O27yO4m73kmycgV"; // code admin de Tom

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri"];
const WEEKEND_KEYS = ["sat", "sun"];
const ALL_DAY_KEYS = [...WEEKDAY_KEYS, ...WEEKEND_KEYS];
const MARGIN_MIN = 15; // marge après chaque cycle (temps de vider la machine)
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

const NAMES = ["Tom", "Lilou", "Moktar", "Alex", "Alexander", "Nathalia"];
const DEFAULT_PINS = ["1111", "2222", "3333", "4444", "5555", "6666"];

const DEFAULT_COMMON_ITEMS = [
  { id: 1, name: "Liquide vaisselle" },
  { id: 2, name: "Éponges" },
  { id: 3, name: "Papier toilette" },
  { id: 4, name: "Sacs poubelle" },
  { id: 5, name: "Javel" },
  { id: 6, name: "Lessive" },
  { id: 7, name: "Essuie-tout" },
  { id: 8, name: "Produit sol" },
];

// id, dayKey, start (minutes depuis minuit), duration (minutes), personId
const DEFAULT_BOOKINGS = [
  { id: 1, dayKey: "mon", start: 18 * 60, duration: 60, personId: 1 },  // Lilou
  { id: 2, dayKey: "tue", start: 18 * 60, duration: 45, personId: 2 },  // Moktar
  { id: 3, dayKey: "wed", start: 18 * 60, duration: 45, personId: 0 },  // Tom
  { id: 4, dayKey: "fri", start: 18 * 60, duration: 60, personId: 3 },  // Alex
  { id: 5, dayKey: "sat", start: 9 * 60, duration: 180, personId: 4 }, // Alexander
  { id: 6, dayKey: "sun", start: 9 * 60, duration: 180, personId: 5 }, // Nathalia
];

const DEFAULT_CHORES = [
  { id: 1, name: "Cuisine" },
  { id: 2, name: "Salle de bain" },
  { id: 3, name: "Sol / Aspirateur" },
  { id: 4, name: "Poubelles & Tri" },
];

const DEFAULT_STATE = {
  roommates: PALETTE.map((color, i) => ({ id: i, name: NAMES[i], color, pin: DEFAULT_PINS[i] })),
  laundryBookings: DEFAULT_BOOKINGS,
  chores: DEFAULT_CHORES,
  commonItems: DEFAULT_COMMON_ITEMS,
  shopping: [],
  commonPurchases: {},
  purchaseHistory: [],
  nextBuyerPtr: 0,
  commonAssignments: {}, // { [commonItemId]: personId } — réservation stable tant que non achetée
};

function timeToMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minToTime(mins) {
  const h = String(Math.floor(mins / 60) % 24).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}
// vérifie si [start, start+duration+marge) chevauche une réservation existante ce jour-là
function findConflict(bookings, dayKey, start, duration, excludeId) {
  const end = start + duration + MARGIN_MIN;
  return bookings.find((b) => {
    if (b.dayKey !== dayKey || b.id === excludeId) return false;
    const bEnd = b.start + b.duration + MARGIN_MIN;
    return start < bEnd && b.start < end;
  });
}

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

const LANG_KEY = "coloc-lang-v1";       // localStorage — préférence perso, par appareil
const EDITOR_KEY = "coloc-editor-v1";   // localStorage — préférence perso, par appareil
const LOGIN_KEY = "coloc-login-v1";     // localStorage — préférence perso, par appareil

const SUPABASE_TABLE = "coloc_state";
const SUPABASE_ROW_ID = 1; // une seule ligne partagée par toute la coloc

const STR = {
  fr: {
    title: "Le cahier de la coloc",
    tabs: { linge: "Linge", taches: "Tâches", courses: "Courses", historique: "Historique", coloc: "La coloc" },
    linge: {
      title: "Planning machine à laver",
      subtitle: "Chacun réserve son créneau : jour, heure, durée. Le système bloque les chevauchements automatiquement.",
      free: "Libre",
      weekdayTitle: "Semaine",
      weekdayNote: "Conseil : privilégie les cycles courts (45 min–1h) en semaine, en fin de journée.",
      weekendTitle: "Week-end",
      weekendNote: "Conseil : les cycles longs (2–3h) passent mieux le week-end, sans contrainte de temps.",
      days: ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"],
      bookTitle: "Réserver un créneau",
      dayLabel: "Jour",
      startLabel: "Heure de début",
      durationLabel: "Durée",
      forWhomLabel: "Pour qui",
      marginNote: `Une marge de ${MARGIN_MIN} min est ajoutée automatiquement après chaque cycle (temps de vider la machine).`,
      bookCta: "Réserver",
      cancelCta: "Annuler",
      noBookings: "Aucun créneau ce jour-là.",
      conflict: (name, range) => `Ce créneau chevauche celui de ${name} (${range}).`,
      durations: [
        { label: "45 min", value: 45 },
        { label: "1h", value: 60 },
        { label: "1h30", value: 90 },
        { label: "2h", value: 120 },
        { label: "2h30", value: 150 },
        { label: "3h", value: 180 },
      ],
      needLogin: "Connecte-toi avec ton code (\"Mon code\" dans le menu) pour réserver un créneau.",
      takenLabel: "pris",
    },
    taches: {
      title: "Tâches ménagères",
      subtitle: (w) => `Semaine ${w} — se met à jour toute seule, rien à faire.`,
      manageTitle: "Gérer les tâches",
      addPlaceholder: "Nouvelle tâche",
      addCta: "Ajouter",
      confirm: "Confirmer",
      saved: "Enregistré",
    },
    courses: {
      title: "Liste de courses",
      subtitle: "Clique sur un essentiel commun pour l'ajouter, coche quand c'est acheté.",
      placeholder: "Autre article",
      empty: "Rien à acheter pour l'instant.",
      needLogin: "Connecte-toi avec ton code (\"Mon code\" dans le menu) pour ajouter ou cocher un article.",
      commonTitle: "Essentiels communs",
      commonHint: "Un clic pour ajouter à la liste. Chaque article ajouté se voit attribuer un tour d'achat différent, réparti entre vous 6.",
      assignedPrefix: "tour de",
      otherTitle: "Autre chose",
      manageCommonTitle: "Gérer les essentiels communs",
      addCommonPlaceholder: "Nouvel essentiel",
    },
    historique: {
      title: "Historique des achats communs",
      subtitle: "Qui a acheté quoi, pour que l'équilibre soit vérifiable par tout le monde.",
      summaryTitle: "Total par personne",
      logTitle: "Détail",
      empty: "Aucun achat commun enregistré pour l'instant.",
      itemsCount: (n) => (n <= 1 ? `${n} achat` : `${n} achats`),
      addManualTitle: "Ajouter un achat manuellement",
      addManualPlaceholder: "Article (ex : PQ)",
      addCta: "Ajouter",
    },
    coloc: { title: "La coloc", subtitle: "Modifie les prénoms et les codes personnels de chacun.", nameLabel: "Prénom", pinLabel: "Code", confirm: "Confirmer", saved: "Enregistré", error: "Échec, réessaie", addTitle: "Ajouter un coloc" },
    lock: {
      locked: "Lecture seule",
      unlockCta: "Déverrouiller",
      pinPh: "Code admin",
      editingAs: "Mode admin actif",
      lockBtn: "Verrouiller",
      wrong: "Code incorrect",
    },
    login: {
      title: "Mon code",
      selectPh: "Qui es-tu ?",
      pinPh: "Ton code",
      connect: "Connexion",
      connectedAs: "Connecté :",
      disconnect: "Déconnexion",
      wrong: "Code incorrect",
      hint: "Ce code te sert à réserver ton créneau linge et gérer les courses.",
      editProfile: "Modifier le mot de passe/nom",
      hideEdit: "Masquer",
      myName: "Prénom",
      myPin: "Mot de passe",
      confirm: "Confirmer",
      saved: "Validé",
    },
  },
  de: {
    title: "Das WG-Heft",
    tabs: { linge: "Wäsche", taches: "Aufgaben", courses: "Einkaufen", historique: "Verlauf", coloc: "Die WG" },
    linge: {
      title: "Waschmaschinen-Plan",
      subtitle: "Jeder bucht seinen eigenen Slot: Tag, Uhrzeit, Dauer. Überschneidungen werden automatisch blockiert.",
      free: "Frei",
      weekdayTitle: "Wochentags",
      weekdayNote: "Tipp: kurze Zyklen (45 Min–1 Std) passen wochentags am besten, am Abend.",
      weekendTitle: "Wochenende",
      weekendNote: "Tipp: lange Zyklen (2–3 Std) klappen besser am Wochenende, ohne Zeitdruck.",
      days: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"],
      bookTitle: "Slot buchen",
      dayLabel: "Tag",
      startLabel: "Startzeit",
      durationLabel: "Dauer",
      forWhomLabel: "Für wen",
      marginNote: `Nach jedem Zyklus wird automatisch eine Marge von ${MARGIN_MIN} Min hinzugefügt (Zeit zum Ausräumen).`,
      bookCta: "Buchen",
      cancelCta: "Stornieren",
      noBookings: "Kein Slot an diesem Tag.",
      conflict: (name, range) => `Überschneidet sich mit dem Slot von ${name} (${range}).`,
      durations: [
        { label: "45 Min", value: 45 },
        { label: "1 Std", value: 60 },
        { label: "1,5 Std", value: 90 },
        { label: "2 Std", value: 120 },
        { label: "2,5 Std", value: 150 },
        { label: "3 Std", value: 180 },
      ],
      needLogin: "Melde dich mit deinem Code an (\"Mein Code\" im Menü), um einen Slot zu buchen.",
      takenLabel: "belegt",
    },
    taches: {
      title: "Haushaltsaufgaben",
      subtitle: (w) => `Woche ${w} — aktualisiert sich automatisch, nichts zu tun.`,
      manageTitle: "Aufgaben verwalten",
      addPlaceholder: "Neue Aufgabe",
      addCta: "Hinzufügen",
      confirm: "Bestätigen",
      saved: "Gespeichert",
    },
    courses: {
      title: "Einkaufsliste",
      subtitle: "Klicke auf ein Gemeinschaftsprodukt, um es hinzuzufügen, hake ab, was gekauft wurde.",
      placeholder: "Etwas anderes",
      empty: "Gerade nichts zu kaufen.",
      needLogin: "Melde dich mit deinem Code an (\"Mein Code\" im Menü), um etwas hinzuzufügen oder abzuhaken.",
      commonTitle: "Gemeinschaftsprodukte",
      commonHint: "Ein Klick fügt es zur Liste hinzu. Jeder hinzugefügte Artikel bekommt reihum eine andere Person zugewiesen, die ihn kauft.",
      assignedPrefix: "dran:",
      otherTitle: "Etwas anderes",
      manageCommonTitle: "Gemeinschaftsprodukte verwalten",
      addCommonPlaceholder: "Neues Produkt",
    },
    historique: {
      title: "Verlauf der Gemeinschaftskäufe",
      subtitle: "Wer was gekauft hat, damit die Fairness für alle nachvollziehbar ist.",
      summaryTitle: "Gesamt pro Person",
      logTitle: "Details",
      empty: "Noch kein Gemeinschaftskauf erfasst.",
      itemsCount: (n) => (n <= 1 ? `${n} Kauf` : `${n} Käufe`),
      addManualTitle: "Kauf manuell hinzufügen",
      addManualPlaceholder: "Artikel (z. B. Klopapier)",
      addCta: "Hinzufügen",
    },
    coloc: { title: "Die WG", subtitle: "Ändere die Vornamen und persönlichen Codes.", nameLabel: "Name", pinLabel: "Code", confirm: "Bestätigen", saved: "Gespeichert", error: "Fehler, nochmal versuchen", addTitle: "Mitbewohner hinzufügen" },
    lock: {
      locked: "Nur Ansicht",
      unlockCta: "Entsperren",
      pinPh: "Admin-Code",
      editingAs: "Admin-Modus aktiv",
      lockBtn: "Sperren",
      wrong: "Falscher Code",
    },
    login: {
      title: "Mein Code",
      selectPh: "Wer bist du?",
      pinPh: "Dein Code",
      connect: "Anmelden",
      connectedAs: "Angemeldet:",
      disconnect: "Abmelden",
      wrong: "Falscher Code",
      hint: "Mit diesem Code buchst du deinen Wäsche-Slot und verwaltest die Einkäufe.",
      editProfile: "Passwort/Name ändern",
      hideEdit: "Ausblenden",
      myName: "Name",
      myPin: "Passwort",
      confirm: "Bestätigen",
      saved: "Bestätigt",
    },
  },
};

async function supabaseSave(nextState) {
  const { error } = await supabase
    .from(SUPABASE_TABLE)
    .update({ data: nextState })
    .eq("id", SUPABASE_ROW_ID);
  if (error) throw error;
}

async function supabaseLoad() {
  const { data, error } = await supabase
    .from(SUPABASE_TABLE)
    .select("data")
    .eq("id", SUPABASE_ROW_ID)
    .single();
  if (error) throw error;
  return data?.data ?? null;
}

function useDebouncedSave(state, ready) {
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(async () => {
      try {
        await supabaseSave(state);
      } catch (e) {
        console.error("Erreur de sauvegarde", e);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [state, ready]);
}

// Sauvegarde immédiate (sans attendre le délai) pour les changements critiques :
// prénoms et codes. Évite qu'un changement se perde si l'onglet se ferme juste après.
async function persistNow(nextState) {
  const delays = [400, 900]; // pauses avant chaque nouvelle tentative
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await supabaseSave(nextState);
      return { ok: true };
    } catch (e) {
      lastError = e;
      console.error("Erreur de sauvegarde immédiate, tentative", attempt + 1, e);
      if (attempt < delays.length) await new Promise((res) => setTimeout(res, delays[attempt]));
    }
  }

  // Le serveur a répondu une erreur à chaque tentative, mais il arrive que
  // l'écriture ait quand même abouti (erreur transitoire côté serveur, ou
  // une autre sauvegarde en arrière-plan qui a pris le relais). On vérifie
  // la vraie valeur enregistrée avant de crier au bug.
  try {
    await new Promise((res) => setTimeout(res, 500));
    const check = await supabaseLoad();
    if (check && JSON.stringify(check) === JSON.stringify(nextState)) return { ok: true };
  } catch (e) {
    // la vérification elle-même a échoué, tant pis, on retombe sur l'erreur d'origine
  }

  const msg = lastError ? String(lastError && lastError.message ? lastError.message : lastError) : "erreur inconnue";
  return { ok: false, error: msg };
}

function DayBookingList({ dayKey, dayLabel, bookings, roommates, isEditor, loggedInId, onCancel, noBookingsLabel, cancelLabel }) {
  const dayBookings = bookings.filter((b) => b.dayKey === dayKey).sort((a, b) => a.start - b.start);

  return (
    <div>
      <span className="text-xs uppercase tracking-wide" style={{ color: "#7A7266", fontFamily: "'IBM Plex Mono', monospace" }}>
        {dayLabel}
      </span>
      <div className="mt-2 flex flex-col gap-2">
        {dayBookings.length === 0 && (
          <p className="text-xs" style={{ color: "#A79B7D" }}>{noBookingsLabel}</p>
        )}
        {dayBookings.map((b) => {
          const person = roommates.find((r) => r.id === b.personId);
          const canCancel = isEditor || b.personId === loggedInId;
          const range = `${minToTime(b.start)}–${minToTime(b.start + b.duration)}`;
          return (
            <div key={b.id} className="flex items-center justify-between px-3 py-2 rounded-sm" style={{ background: person?.color || "#FFFFFF" }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs flex-shrink-0" style={{ color: "rgba(255,255,255,0.85)", fontFamily: "'IBM Plex Mono', monospace" }}>{range}</span>
                <span className="text-sm font-semibold truncate" style={{ color: "#FFF", fontFamily: "'Space Grotesk', sans-serif" }}>{person?.name}</span>
              </div>
              {canCancel && (
                <button onClick={() => onCancel(b.id)} className="text-xs flex-shrink-0 underline" style={{ color: "rgba(255,255,255,0.85)" }}>
                  {cancelLabel}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LaundryBookingForm({ roommates, isEditor, loggedInId, onBook, bookings, l }) {
  const [dayKey, setDayKey] = useState("mon");
  const [startTime, setStartTime] = useState("18:00");
  const [duration, setDuration] = useState(l.durations[0].value);
  const [forPersonId, setForPersonId] = useState(loggedInId ?? roommates[0]?.id ?? 0);
  const [status, setStatus] = useState(null); // null | "saved"
  const [conflictMsg, setConflictMsg] = useState("");

  // Un créneau de départ est indisponible si lui-même (avec la durée choisie + marge)
  // chevauche une réservation déjà existante ce jour-là.
  const isTimeTaken = (time) => findConflict(bookings, dayKey, timeToMin(time), duration, null) !== undefined;

  const submit = async () => {
    const personId = isEditor ? forPersonId : loggedInId;
    const conflict = findConflict(bookings, dayKey, timeToMin(startTime), duration, null);
    if (conflict) {
      const owner = roommates.find((r) => r.id === conflict.personId);
      const range = `${minToTime(conflict.start)}–${minToTime(conflict.start + conflict.duration + MARGIN_MIN)}`;
      setConflictMsg(l.conflict(owner?.name || "?", range));
      setStatus(null);
      return;
    }
    setConflictMsg("");
    onBook(dayKey, startTime, duration, personId); // sauvegarde en fond
    setStatus("saved");
    setTimeout(() => setStatus(null), 2000);
  };

  return (
    <div className="p-4 rounded-sm flex flex-col gap-3" style={{ background: "#FFFFFF", border: "1px solid #E4DCC9" }}>
      <div className="flex flex-col gap-1">
        <span className="text-[10px]" style={{ color: "#A79B7D", fontFamily: "'IBM Plex Mono', monospace" }}>{l.dayLabel}</span>
        <select value={dayKey} onChange={(e) => { setDayKey(e.target.value); setConflictMsg(""); }} className="px-2 py-1.5 rounded-sm text-sm outline-none" style={{ border: "1px solid #DCD1B6", background: "#FFFFFF" }}>
          {ALL_DAY_KEYS.map((k, i) => (<option key={k} value={k}>{l.days[i]}</option>))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px]" style={{ color: "#A79B7D", fontFamily: "'IBM Plex Mono', monospace" }}>{l.startLabel}</span>
          <select value={startTime} onChange={(e) => { setStartTime(e.target.value); setConflictMsg(""); }} className="px-2 py-1.5 rounded-sm text-sm outline-none" style={{ border: "1px solid #DCD1B6", background: "#FFFFFF", fontFamily: "'IBM Plex Mono', monospace" }}>
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t} disabled={isTimeTaken(t)}>
                {t}{isTimeTaken(t) ? ` (${l.takenLabel})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px]" style={{ color: "#A79B7D", fontFamily: "'IBM Plex Mono', monospace" }}>{l.durationLabel}</span>
          <select value={duration} onChange={(e) => { setDuration(parseInt(e.target.value)); setConflictMsg(""); }} className="px-2 py-1.5 rounded-sm text-sm outline-none" style={{ border: "1px solid #DCD1B6", background: "#FFFFFF" }}>
            {l.durations.map((d) => (<option key={d.value} value={d.value}>{d.label}</option>))}
          </select>
        </div>
      </div>
      {isEditor && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px]" style={{ color: "#A79B7D", fontFamily: "'IBM Plex Mono', monospace" }}>{l.forWhomLabel}</span>
          <select value={forPersonId} onChange={(e) => setForPersonId(parseInt(e.target.value))} className="px-2 py-1.5 rounded-sm text-sm outline-none" style={{ border: "1px solid #DCD1B6", background: "#FFFFFF" }}>
            {roommates.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
          </select>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={submit}
          className="px-4 py-2 rounded-sm text-sm font-semibold"
          style={{ background: "#2E2B26", color: "#F3EDE1", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {l.bookCta}
        </button>
        {status === "saved" && (
          <span className="flex items-center gap-1 text-xs" style={{ color: "#3F8C82" }}><Check size={13} /> ✓</span>
        )}
        {conflictMsg && (
          <span className="text-xs" style={{ color: "#A8503B" }}>{conflictMsg}</span>
        )}
      </div>
      <p className="text-[11px]" style={{ color: "#A79B7D" }}>{l.marginNote}</p>
    </div>
  );
}

function ChoreEditor({ name, onRename, onRemove, confirmLabel, savedLabel }) {
  const [draft, setDraft] = useState(name);
  const [status, setStatus] = useState(null); // null | "saved"

  useEffect(() => { setDraft(name); }, [name]);

  const changed = draft !== name;

  const confirm = () => {
    onRename(draft); // sauvegarde en fond
    setStatus("saved");
    setTimeout(() => setStatus(null), 2000);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-sm" style={{ background: "#FFFFFF", border: "1px solid #E4DCC9" }}>
      <input
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setStatus(null); }}
        className="flex-1 min-w-0 px-2 py-1.5 rounded-sm text-sm outline-none"
        style={{ border: "1px solid #DCD1B6", background: "#FFFFFF", fontFamily: "'Space Grotesk', sans-serif" }}
      />
      {changed && (
        <button onClick={confirm} className="px-2.5 py-1.5 rounded-sm text-xs font-semibold flex-shrink-0" style={{ background: "#2E2B26", color: "#F3EDE1", fontFamily: "'Space Grotesk', sans-serif" }}>
          {confirmLabel}
        </button>
      )}
      {status === "saved" && (
        <span className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: "#3F8C82" }}><Check size={13} /> {savedLabel}</span>
      )}
      <button onClick={onRemove} className="flex-shrink-0"><Trash2 size={16} color="#A79B7D" /></button>
    </div>
  );
}

function HistoryEntryEditor({ entry, buyer, dateStr, roommates, onSave, onRemove, confirmLabel, savedLabel }) {
  const [text, setText] = useState(entry.itemText);
  const [buyerId, setBuyerId] = useState(entry.buyerId);
  const [status, setStatus] = useState(null); // null | "saved"

  useEffect(() => { setText(entry.itemText); setBuyerId(entry.buyerId); }, [entry.itemText, entry.buyerId]);

  const changed = text !== entry.itemText || buyerId !== entry.buyerId;

  const confirm = () => {
    onSave(text, buyerId);
    setStatus("saved");
    setTimeout(() => setStatus(null), 2000);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap px-3 py-2 rounded-sm" style={{ background: "#FFFFFF", border: "1px solid #E4DCC9" }}>
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: buyer?.color || "#A79B7D" }} />
      <input
        value={text}
        onChange={(e) => { setText(e.target.value); setStatus(null); }}
        className="flex-1 min-w-[90px] px-2 py-1 rounded-sm text-sm outline-none"
        style={{ border: "1px solid #DCD1B6", background: "#FFFFFF" }}
      />
      <select
        value={buyerId}
        onChange={(e) => { setBuyerId(parseInt(e.target.value)); setStatus(null); }}
        className="px-1.5 py-1 rounded-sm text-xs outline-none"
        style={{ border: "1px solid #DCD1B6", background: "#FFFFFF" }}
      >
        {roommates.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
      </select>
      <span className="text-xs flex-shrink-0" style={{ color: "#A79B7D", fontFamily: "'IBM Plex Mono', monospace" }}>{dateStr}</span>
      {changed && (
        <button onClick={confirm} className="px-2 py-1 rounded-sm text-xs font-semibold flex-shrink-0" style={{ background: "#2E2B26", color: "#F3EDE1" }}>
          {confirmLabel}
        </button>
      )}
      {status === "saved" && (
        <span className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: "#3F8C82" }}><Check size={12} /> {savedLabel}</span>
      )}
      <button onClick={onRemove} className="flex-shrink-0"><Trash2 size={14} color="#A79B7D" /></button>
    </div>
  );
}

function AddRoommateForm({ onAdd, nameLabel, pinLabel, cta }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");

  const submit = () => {
    if (!name.trim() || !pin.trim()) return;
    onAdd(name, pin);
    setName("");
    setPin("");
  };

  return (
    <div className="flex gap-2 flex-wrap">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={nameLabel}
        className="flex-1 min-w-[100px] px-3 py-2 rounded-sm text-sm outline-none"
        style={{ border: "1px solid #DCD1B6", background: "#FFFFFF" }}
      />
      <input
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={pinLabel}
        className="w-24 px-3 py-2 rounded-sm text-sm outline-none"
        style={{ border: "1px solid #DCD1B6", background: "#FFFFFF", fontFamily: "'IBM Plex Mono', monospace" }}
      />
      <button onClick={submit} className="px-3 rounded-sm flex-shrink-0" style={{ background: "#2E2B26", color: "#F3EDE1" }}>
        <Plus size={18} />
      </button>
    </div>
  );
}

function ManualHistoryForm({ roommates, onAdd, placeholder, cta }) {
  const [text, setText] = useState("");
  const [buyerId, setBuyerId] = useState(roommates[0]?.id ?? 0);

  const submit = () => {
    if (!text.trim()) return;
    onAdd(text, buyerId);
    setText("");
  };

  return (
    <div className="flex gap-2 flex-wrap">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={placeholder}
        className="flex-1 min-w-[120px] px-3 py-2 rounded-sm text-sm outline-none"
        style={{ border: "1px solid #DCD1B6", background: "#FFFFFF" }}
      />
      <select
        value={buyerId}
        onChange={(e) => setBuyerId(parseInt(e.target.value))}
        className="px-2 py-2 rounded-sm text-sm outline-none"
        style={{ border: "1px solid #DCD1B6", background: "#FFFFFF" }}
      >
        {roommates.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
      </select>
      <button onClick={submit} className="px-3 rounded-sm flex-shrink-0" style={{ background: "#2E2B26", color: "#F3EDE1" }}>
        <Plus size={18} />
      </button>
    </div>
  );
}

function TachesTab({ currentWeek, chores, roommates, isEditor, onAddChore, onRenameChore, onRemoveChore, l }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const displayedWeek = currentWeek + weekOffset;
  const maxOffset = 8;

  return (
    <Paper>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SectionTitle title={l.taches.title} subtitle={l.taches.subtitle(displayedWeek)} />
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => setWeekOffset((w) => Math.max(0, w - 1))} disabled={weekOffset === 0} style={{ opacity: weekOffset === 0 ? 0.3 : 1 }}>
            <ChevronLeft size={20} color="#7A7266" />
          </button>
          <button onClick={() => setWeekOffset((w) => Math.min(maxOffset, w + 1))} disabled={weekOffset === maxOffset} style={{ opacity: weekOffset === maxOffset ? 0.3 : 1 }}>
            <ChevronRight size={20} color="#7A7266" />
          </button>
        </div>
      </div>
      <div className="mt-8 grid sm:grid-cols-2 gap-4">
        {chores.map((chore, c) => {
          const person = roommates[(displayedWeek + c) % roommates.length];
          return (
            <div key={chore.id} className="p-4 rounded-sm flex items-center justify-between" style={{ background: "#FFFFFF", border: "1px solid #E4DCC9" }}>
              <div>
                <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "#A79B7D", fontFamily: "'IBM Plex Mono', monospace" }}>{chore.name}</div>
                <div className="font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#2E2B26" }}>{person.name}</div>
              </div>
              <div className="w-3 h-10 rounded-full" style={{ background: person.color }} />
            </div>
          );
        })}
      </div>

      {isEditor && (
        <div className="mt-10 pt-8" style={{ borderTop: "1px dashed #DCD1B6" }}>
          <h3 className="mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "#2E2B26" }}>
            {l.taches.manageTitle}
          </h3>
          <div className="flex flex-col gap-2">
            {chores.map((chore) => (
              <ChoreEditor
                key={chore.id}
                name={chore.name}
                onRename={(v) => onRenameChore(chore.id, v)}
                onRemove={() => onRemoveChore(chore.id)}
                confirmLabel={l.taches.confirm}
                savedLabel={l.taches.saved}
              />
            ))}
          </div>
          <AddChoreForm onAdd={onAddChore} placeholder={l.taches.addPlaceholder} cta={l.taches.addCta} />
        </div>
      )}
    </Paper>
  );
}

function AddChoreForm({ onAdd, placeholder, cta }) {
  const [value, setValue] = useState("");

  const submit = () => {
    if (!value.trim()) return;
    onAdd(value);
    setValue("");
  };

  return (
    <div className="mt-3 flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={placeholder}
        className="flex-1 min-w-0 px-3 py-2 rounded-sm text-sm outline-none"
        style={{ border: "1px solid #DCD1B6", background: "#FFFFFF" }}
      />
      <button onClick={submit} className="px-3 rounded-sm flex-shrink-0" style={{ background: "#2E2B26", color: "#F3EDE1" }}>
        <Plus size={18} />
      </button>
    </div>
  );
}

function NameCodeEditor({ name, pin, onSave, nameLabel, pinLabel, confirmLabel, savedLabel, dotColor }) {
  const [draftName, setDraftName] = useState(name);
  const [draftPin, setDraftPin] = useState(pin);
  const [status, setStatus] = useState(null); // null | "saving" | "saved"

  useEffect(() => { setDraftName(name); }, [name]);
  useEffect(() => { setDraftPin(pin); }, [pin]);

  const changed = draftName !== name || draftPin !== pin;

  const confirm = async () => {
    setStatus("saving");
    onSave(draftName, draftPin); // sauvegarde en fond (avec ses propres tentatives), pas besoin d'attendre pour rassurer l'utilisateur
    setStatus("saved");
    setTimeout(() => setStatus(null), 2000);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {dotColor && <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />}
        <span className="text-[10px] w-12 flex-shrink-0" style={{ color: "#A79B7D", fontFamily: "'IBM Plex Mono', monospace" }}>{nameLabel}</span>
        <input
          value={draftName}
          onChange={(e) => { setDraftName(e.target.value); setStatus(null); }}
          className="px-2 py-1.5 rounded-sm text-xs outline-none flex-1 min-w-0"
          style={{ border: "1px solid #DCD1B6", background: "#FFFFFF", fontFamily: "'Space Grotesk', sans-serif" }}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] w-12 flex-shrink-0" style={{ color: "#A79B7D", fontFamily: "'IBM Plex Mono', monospace", marginLeft: dotColor ? "22px" : "0" }}>{pinLabel}</span>
        <input
          value={draftPin}
          onChange={(e) => { setDraftPin(e.target.value); setStatus(null); }}
          className="px-2 py-1.5 rounded-sm text-xs outline-none flex-1 min-w-0"
          style={{ border: "1px solid #DCD1B6", background: "#FFFFFF", fontFamily: "'IBM Plex Mono', monospace" }}
        />
      </div>
      {(changed || status) && (
        <div className="flex items-center gap-2" style={{ marginLeft: dotColor ? "22px" : "0" }}>
          {changed && (
            <button
              onClick={confirm}
              className="px-3 py-1.5 rounded-sm text-xs font-semibold flex-shrink-0"
              style={{ background: "#2E2B26", color: "#F3EDE1", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {confirmLabel}
            </button>
          )}
          {status && (
            <span className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: "#3F8C82" }}>
              <Check size={13} /> {savedLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, color }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3.5 py-2.5 md:px-4 md:py-3 text-left w-auto md:w-full flex-shrink-0 whitespace-nowrap transition-all"
      style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 600,
        fontSize: "0.95rem",
        color: active ? "#2E2B26" : "#7A7266",
        background: active ? "#F3EDE1" : "transparent",
        borderLeft: active ? `4px solid ${color}` : "4px solid transparent",
      }}
    >
      <Icon size={18} strokeWidth={2} />
      {label}
    </button>
  );
}

function Paper({ children }) {
  return (
    <div
      className="rounded-md p-5 md:p-8"
      style={{
        background: "repeating-linear-gradient(#F3EDE1, #F3EDE1 31px, #E4DCC9 32px)",
        border: "1px solid #DCD1B6",
        boxShadow: "0 2px 12px rgba(46,43,38,0.06)",
        minHeight: "420px",
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "1.4rem", color: "#2E2B26" }}>
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1 text-sm" style={{ color: "#A79B7D" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function LockBar({ isEditor, onUnlock, onLock, l }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  const tryUnlock = () => {
    if (pin === EDIT_PIN) {
      onUnlock();
      setPin("");
      setErr(false);
    } else {
      setErr(true);
    }
  };

  if (isEditor) {
    return (
      <div className="flex items-center gap-2 text-xs" style={{ color: "#3F8C82", fontFamily: "'IBM Plex Mono', monospace" }}>
        {l.editingAs}
        <button onClick={onLock} className="underline ml-1" style={{ color: "#7A7266" }}>
          {l.lockBtn}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 text-xs" style={{ color: "#A79B7D", fontFamily: "'IBM Plex Mono', monospace" }}>
        {l.locked}
      </div>
      <input
        value={pin}
        onChange={(e) => { setPin(e.target.value); setErr(false); }}
        onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
        placeholder={l.pinPh}
        type="password"
        className="flex-1 min-w-[140px] px-2 py-1 rounded-sm text-xs outline-none"
        style={{ border: err ? "1px solid #A8503B" : "1px solid #DCD1B6", background: "#FFFFFF" }}
      />
      <button
        onClick={tryUnlock}
        className="px-2 py-1 rounded-sm text-xs font-semibold"
        style={{ background: "#2E2B26", color: "#F3EDE1", fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {l.unlockCta}
      </button>
      {err && <span className="text-xs" style={{ color: "#A8503B" }}>{l.wrong}</span>}
    </div>
  );
}

function PersonalLogin({ roommates, loggedInId, onLogin, onLogout, onSaveProfile, l }) {
  const [selected, setSelected] = useState(roommates[0]?.id ?? 0);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const [editing, setEditing] = useState(false);

  const tryLogin = () => {
    const person = roommates.find((r) => r.id === selected);
    if (person && pin === person.pin) {
      onLogin(person.id);
      setPin("");
      setErr(false);
    } else {
      setErr(true);
    }
  };

  if (loggedInId !== null) {
    const person = roommates.find((r) => r.id === loggedInId);
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs flex-wrap" style={{ color: person?.color, fontFamily: "'IBM Plex Mono', monospace" }}>
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: person?.color }} />
          {l.connectedAs} <strong>{person?.name}</strong>
          <button onClick={onLogout} className="underline ml-1" style={{ color: "#7A7266" }}>
            {l.disconnect}
          </button>
          <button onClick={() => setEditing((v) => !v)} className="underline" style={{ color: "#7A7266" }}>
            {editing ? l.hideEdit : l.editProfile}
          </button>
        </div>
        {editing && person && (
          <div className="pt-1">
            <NameCodeEditor
              name={person.name}
              pin={person.pin}
              onSave={onSaveProfile}
              nameLabel={l.myName}
              pinLabel={l.myPin}
              confirmLabel={l.confirm}
              savedLabel={l.saved}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1 text-xs" style={{ color: "#A79B7D", fontFamily: "'IBM Plex Mono', monospace" }}>
        {l.title}
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <select
          value={selected}
          onChange={(e) => setSelected(parseInt(e.target.value))}
          className="px-1.5 py-1 rounded-sm text-xs outline-none"
          style={{ border: "1px solid #DCD1B6", background: "#FFFFFF" }}
        >
          {roommates.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
        </select>
        <input
          value={pin}
          onChange={(e) => { setPin(e.target.value); setErr(false); }}
          onKeyDown={(e) => e.key === "Enter" && tryLogin()}
          placeholder={l.pinPh}
          type="password"
          className="w-16 px-2 py-1 rounded-sm text-xs outline-none"
          style={{ border: err ? "1px solid #A8503B" : "1px solid #DCD1B6", background: "#FFFFFF" }}
        />
        <button
          onClick={tryLogin}
          className="px-2 py-1 rounded-sm text-xs font-semibold"
          style={{ background: "#2E2B26", color: "#F3EDE1", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {l.connect}
        </button>
      </div>
      {err && <span className="text-xs" style={{ color: "#A8503B" }}>{l.wrong}</span>}
    </div>
  );
}

export default function ColocOrganiser() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("linge");
  const [newItem, setNewItem] = useState("");
  const [lang, setLang] = useState("fr");
  const [loggedInId, setLoggedInId] = useState(null);
  const [isEditor, setIsEditor] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const loaded = await supabaseLoad();
        if (loaded) setState({ ...DEFAULT_STATE, ...loaded });
      } catch (e) {
        console.error("Erreur de chargement", e);
      }
      try {
        const savedLang = localStorage.getItem(LANG_KEY);
        if (savedLang) setLang(savedLang);
      } catch (e) {}
      try {
        const savedLogin = localStorage.getItem(LOGIN_KEY);
        if (savedLogin !== null && savedLogin !== "") setLoggedInId(parseInt(savedLogin));
      } catch (e) {}
      try {
        const savedEditor = localStorage.getItem(EDITOR_KEY);
        if (savedEditor === "true") setIsEditor(true);
      } catch (e) {}
      setReady(true);
    })();
  }, []);

  useDebouncedSave(state, ready);

  useEffect(() => {
    if (!isEditor && tab === "coloc") setTab("linge");
  }, [isEditor, tab]);

  const l = STR[lang];
  const roommates = state.roommates;
  const currentWeek = getISOWeek(new Date());
  const lockStyle = !isEditor ? { opacity: 0.55, pointerEvents: "none" } : {};
  const canShop = isEditor || loggedInId !== null;
  const shopStyle = !canShop ? { opacity: 0.55, pointerEvents: "none" } : {};
  const currentName = loggedInId !== null ? roommates.find((r) => r.id === loggedInId)?.name : isEditor ? "Admin" : null;

  const changeLang = async (newLang) => {
    setLang(newLang);
    try { localStorage.setItem(LANG_KEY, newLang); } catch (e) {}
  };

  const unlock = async () => {
    setIsEditor(true);
    try { localStorage.setItem(EDITOR_KEY, "true"); } catch (e) {}
  };
  const lock = async () => {
    setIsEditor(false);
    try { localStorage.setItem(EDITOR_KEY, "false"); } catch (e) {}
  };

  const doLogin = async (id) => {
    setLoggedInId(id);
    try { localStorage.setItem(LOGIN_KEY, String(id)); } catch (e) {}
  };
  const doLogout = async () => {
    setLoggedInId(null);
    try { localStorage.setItem(LOGIN_KEY, ""); } catch (e) {}
  };

  const addBooking = async (dayKey, startTime, duration, forPersonId) => {
    let personId = forPersonId;
    if (isEditor) {
      // l'admin peut réserver au nom de n'importe qui
      if (personId === null || personId === undefined) return { ok: false, error: "personne manquante" };
    } else if (loggedInId !== null) {
      personId = loggedInId; // chacun ne peut réserver que pour soi-même
    } else {
      return { ok: false, error: "non connecté" };
    }
    const start = timeToMin(startTime);
    const conflict = findConflict(state.laundryBookings, dayKey, start, duration, null);
    if (conflict) return { ok: false, conflict };

    const booking = { id: Date.now(), dayKey, start, duration, personId };
    const next = { ...state, laundryBookings: [...state.laundryBookings, booking] };
    setState(next);
    return persistNow(next);
  };

  const cancelBooking = async (id) => {
    const booking = state.laundryBookings.find((b) => b.id === id);
    if (!booking) return { ok: false, error: "introuvable" };
    if (!isEditor && booking.personId !== loggedInId) return { ok: false, error: "pas ton créneau" };
    const next = { ...state, laundryBookings: state.laundryBookings.filter((b) => b.id !== id) };
    setState(next);
    return persistNow(next);
  };

  const saveRoommateProfile = async (id, name, pin) => {
    if (!isEditor) return { ok: false, error: "mode admin non actif" };
    const next = { ...state, roommates: state.roommates.map((r) => (r.id === id ? { ...r, name, pin } : r)) };
    setState(next);
    return persistNow(next);
  };

  const saveOwnProfile = async (name, pin) => {
    if (loggedInId === null) return { ok: false, error: "pas connecté" };
    const next = { ...state, roommates: state.roommates.map((r) => (r.id === loggedInId ? { ...r, name, pin } : r)) };
    setState(next);
    return persistNow(next);
  };

  const addChore = async (name) => {
    if (!isEditor || !name.trim()) return { ok: false, error: "admin requis" };
    const next = { ...state, chores: [...state.chores, { id: Date.now(), name: name.trim() }] };
    setState(next);
    return persistNow(next);
  };

  const renameChore = async (id, name) => {
    if (!isEditor) return { ok: false, error: "admin requis" };
    const next = { ...state, chores: state.chores.map((c) => (c.id === id ? { ...c, name } : c)) };
    setState(next);
    return persistNow(next);
  };

  const removeChore = async (id) => {
    if (!isEditor) return { ok: false, error: "admin requis" };
    const next = { ...state, chores: state.chores.filter((c) => c.id !== id) };
    setState(next);
    return persistNow(next);
  };

  const addCommonItemDef = async (name) => {
    if (!isEditor || !name.trim()) return { ok: false, error: "admin requis" };
    const next = { ...state, commonItems: [...state.commonItems, { id: Date.now(), name: name.trim() }] };
    setState(next);
    return persistNow(next);
  };

  const renameCommonItemDef = async (id, name) => {
    if (!isEditor) return { ok: false, error: "admin requis" };
    const next = { ...state, commonItems: state.commonItems.map((c) => (c.id === id ? { ...c, name } : c)) };
    setState(next);
    return persistNow(next);
  };

  const removeCommonItemDef = async (id) => {
    if (!isEditor) return { ok: false, error: "admin requis" };
    const next = { ...state, commonItems: state.commonItems.filter((c) => c.id !== id) };
    setState(next);
    return persistNow(next);
  };

  const addRoommate = async (name, pin) => {
    if (!isEditor || !name.trim() || !pin.trim()) return { ok: false, error: "admin requis" };
    const newId = Date.now();
    const color = PALETTE[state.roommates.length % PALETTE.length];
    const next = { ...state, roommates: [...state.roommates, { id: newId, name: name.trim(), pin: pin.trim(), color }] };
    setState(next);
    return persistNow(next);
  };

  const removeRoommate = async (id) => {
    if (!isEditor) return { ok: false, error: "admin requis" };
    // Suppression complète : ce coloc et tout ce qui lui est lié (créneaux linge,
    // compteur d'achats, historique, réservations en cours).
    const newAssignments = { ...state.commonAssignments };
    Object.keys(newAssignments).forEach((k) => { if (newAssignments[k] === id) delete newAssignments[k]; });
    const newCommonPurchases = { ...state.commonPurchases };
    delete newCommonPurchases[id];
    const next = {
      ...state,
      roommates: state.roommates.filter((r) => r.id !== id),
      laundryBookings: state.laundryBookings.filter((b) => b.personId !== id),
      purchaseHistory: state.purchaseHistory.filter((h) => h.buyerId !== id),
      commonPurchases: newCommonPurchases,
      commonAssignments: newAssignments,
      shopping: state.shopping.filter((it) => it.assignedBuyerId !== id),
    };
    setState(next);
    return persistNow(next);
  };

  const removeHistoryEntry = (id) => {
    if (!isEditor) return;
    setState((s) => {
      const entry = s.purchaseHistory.find((h) => h.id === id);
      if (!entry) return s;
      const newCount = Math.max(0, (s.commonPurchases[entry.buyerId] || 0) - 1);
      return {
        ...s,
        purchaseHistory: s.purchaseHistory.filter((h) => h.id !== id),
        commonPurchases: { ...s.commonPurchases, [entry.buyerId]: newCount },
      };
    });
  };

  const editHistoryEntry = (id, itemText, buyerId) => {
    if (!isEditor || !itemText.trim()) return;
    setState((s) => {
      const entry = s.purchaseHistory.find((h) => h.id === id);
      if (!entry) return s;
      const buyer = s.roommates.find((r) => r.id === buyerId);
      let counts = s.commonPurchases;
      if (buyerId !== entry.buyerId) {
        // le compteur suit le changement de personne
        counts = {
          ...counts,
          [entry.buyerId]: Math.max(0, (counts[entry.buyerId] || 0) - 1),
          [buyerId]: (counts[buyerId] || 0) + 1,
        };
      }
      return {
        ...s,
        purchaseHistory: s.purchaseHistory.map((h) => (h.id === id ? { ...h, itemText: itemText.trim(), buyerId, buyerName: buyer?.name } : h)),
        commonPurchases: counts,
      };
    });
  };

  const addManualHistoryEntry = (itemText, buyerId) => {
    if (!isEditor || !itemText.trim()) return;
    setState((s) => {
      const buyer = s.roommates.find((r) => r.id === buyerId);
      return {
        ...s,
        purchaseHistory: [{ id: Date.now(), itemText: itemText.trim(), buyerId, buyerName: buyer?.name, ts: Date.now() }, ...s.purchaseHistory].slice(0, 60),
        commonPurchases: { ...s.commonPurchases, [buyerId]: (s.commonPurchases[buyerId] || 0) + 1 },
      };
    });
  };

  const addCommonItem = (itemId) => {
    if (!canShop) return;
    setState((s) => {
      const alreadyPending = s.shopping.some((it) => it.commonIndex === itemId && !it.done);
      if (alreadyPending) return s;
      const def = s.commonItems.find((c) => c.id === itemId);
      if (!def) return s;
      // Si une réservation existe déjà pour ce produit (pas encore acheté), on la réutilise —
      // ça empêche de supprimer/re-ajouter pour retirer un tirage au sort.
      const reserved = s.commonAssignments[itemId];
      const hasReservation = reserved !== undefined && reserved !== null;
      const assignedBuyerId = hasReservation ? reserved : (s.roommates[s.nextBuyerPtr % s.roommates.length]?.id ?? null);
      return {
        ...s,
        shopping: [...s.shopping, { id: Date.now(), text: def.name, done: false, addedBy: currentName, commonIndex: itemId, assignedBuyerId }],
        nextBuyerPtr: hasReservation ? s.nextBuyerPtr : (s.nextBuyerPtr + 1) % s.roommates.length,
        commonAssignments: { ...s.commonAssignments, [itemId]: assignedBuyerId },
      };
    });
  };

  const addShoppingItem = () => {
    if (!canShop || !newItem.trim()) return;
    setState((s) => ({ ...s, shopping: [...s.shopping, { id: Date.now(), text: newItem.trim(), done: false, addedBy: currentName, commonIndex: null, assignedBuyerId: null }] }));
    setNewItem("");
  };

  const toggleShoppingItem = (id) => {
    if (!canShop) return;
    const item = state.shopping.find((it) => it.id === id);
    if (!item) return;
    // Pour les essentiels communs, seule la personne à qui c'est le tour peut cocher —
    // les autres peuvent voir la liste et ajouter des articles, mais pas confirmer à sa place.
    if (item.commonIndex !== null && !isEditor && item.assignedBuyerId !== loggedInId) return;
    setState((s) => {
      const item = s.shopping.find((it) => it.id === id);
      const nowDone = item ? !item.done : false;
      const isCommonCompletion = item && !item.done && nowDone && item.commonIndex !== null;
      const shouldCount = isCommonCompletion && loggedInId !== null;
      const buyer = shouldCount ? roommates.find((r) => r.id === loggedInId) : null;
      const newHistory = shouldCount
        ? [{ id: Date.now(), itemText: item.text, buyerId: loggedInId, buyerName: buyer?.name, ts: Date.now() }, ...s.purchaseHistory].slice(0, 60)
        : s.purchaseHistory;
      const newAssignments = { ...s.commonAssignments };
      if (isCommonCompletion) delete newAssignments[item.commonIndex]; // la réservation est levée, prochain tirage sera nouveau
      return {
        ...s,
        shopping: s.shopping.map((it) => (it.id === id ? { ...it, done: !it.done } : it)),
        commonPurchases: shouldCount
          ? { ...s.commonPurchases, [loggedInId]: (s.commonPurchases[loggedInId] || 0) + 1 }
          : s.commonPurchases,
        purchaseHistory: newHistory,
        commonAssignments: newAssignments,
      };
    });
  };

  // Supprimer un article NE lève PAS la réservation : re-ajouter le même produit
  // redonnera la même personne, impossible de "réessayer" en supprimant.
  const removeShoppingItem = (id) => { if (canShop) setState((s) => ({ ...s, shopping: s.shopping.filter((it) => it.id !== id) })); };

  return (
    <div className="w-full min-h-screen flex flex-col md:flex-row" style={{ background: "#E4DCC9", fontFamily: "'Inter', sans-serif" }}>
      <style>{FONT_IMPORT}</style>

      <div className="md:hidden p-4 pb-0">
        <Header title={l.title} />
      </div>

      <div className="md:w-60 w-full flex md:flex-col md:min-h-screen" style={{ background: "#EFE7D6", borderRight: "1px solid #DCD1B6" }}>
        <div className="hidden md:block p-5 pb-2">
          <Header title={l.title} />
        </div>
        <div className="flex md:flex-col flex-1 overflow-x-auto md:overflow-visible">
          <TabButton active={tab === "linge"} onClick={() => setTab("linge")} icon={Shirt} label={l.tabs.linge} color="#5B7FA6" />
          <TabButton active={tab === "taches"} onClick={() => setTab("taches")} icon={ClipboardList} label={l.tabs.taches} color="#6B8F71" />
          <TabButton active={tab === "courses"} onClick={() => setTab("courses")} icon={ShoppingCart} label={l.tabs.courses} color="#C99A2E" />
          <TabButton active={tab === "historique"} onClick={() => setTab("historique")} icon={History} label={l.tabs.historique} color="#3F8C82" />
          {isEditor && (
            <TabButton active={tab === "coloc"} onClick={() => setTab("coloc")} icon={Users} label={l.tabs.coloc} color="#8B5A7C" />
          )}
        </div>
        <div className="p-4 hidden md:flex flex-col gap-3">
          <div className="flex gap-1">
            <button onClick={() => changeLang("fr")} className="flex-1 py-1 rounded-sm text-xs font-semibold" style={{ background: lang === "fr" ? "#2E2B26" : "#FFFFFF", color: lang === "fr" ? "#F3EDE1" : "#7A7266", fontFamily: "'Space Grotesk', sans-serif" }}>FR</button>
            <button onClick={() => changeLang("de")} className="flex-1 py-1 rounded-sm text-xs font-semibold" style={{ background: lang === "de" ? "#2E2B26" : "#FFFFFF", color: lang === "de" ? "#F3EDE1" : "#7A7266", fontFamily: "'Space Grotesk', sans-serif" }}>DE</button>
          </div>
          <PersonalLogin roommates={roommates} loggedInId={loggedInId} onLogin={doLogin} onLogout={doLogout} onSaveProfile={saveOwnProfile} l={l.login} />
          <div className="pt-2" style={{ borderTop: "1px dashed #DCD1B6" }}>
            <LockBar isEditor={isEditor} onUnlock={unlock} onLock={lock} l={l.lock} />
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-8">
        <div className="md:hidden flex flex-col gap-3 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-1">
              <button onClick={() => changeLang("fr")} className="px-3 py-1 rounded-sm text-xs font-semibold" style={{ background: lang === "fr" ? "#2E2B26" : "#FFFFFF", color: lang === "fr" ? "#F3EDE1" : "#7A7266" }}>FR</button>
              <button onClick={() => changeLang("de")} className="px-3 py-1 rounded-sm text-xs font-semibold" style={{ background: lang === "de" ? "#2E2B26" : "#FFFFFF", color: lang === "de" ? "#F3EDE1" : "#7A7266" }}>DE</button>
            </div>
            <LockBar isEditor={isEditor} onUnlock={unlock} onLock={lock} l={l.lock} />
          </div>
          <PersonalLogin roommates={roommates} loggedInId={loggedInId} onLogin={doLogin} onLogout={doLogout} onSaveProfile={saveOwnProfile} l={l.login} />
        </div>

        {tab === "linge" && (
          <Paper>
            <SectionTitle title={l.linge.title} subtitle={l.linge.subtitle} />
            {!isEditor && loggedInId === null && <p className="mt-2 text-xs" style={{ color: "#A8503B" }}>{l.linge.needLogin}</p>}

            {(isEditor || loggedInId !== null) && (
              <div className="mt-6">
                <h3 className="mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "#2E2B26" }}>
                  {l.linge.bookTitle}
                </h3>
                <LaundryBookingForm roommates={roommates} isEditor={isEditor} loggedInId={loggedInId} onBook={addBooking} bookings={state.laundryBookings} l={l.linge} />
              </div>
            )}

            {/* Semaine */}
            <div className="mt-10 pt-8" style={{ borderTop: "1px dashed #DCD1B6" }}>
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "1rem", color: "#2E2B26" }}>
                {l.linge.weekdayTitle}
              </h3>
              <p className="mt-1 text-xs mb-4" style={{ color: "#A79B7D" }}>{l.linge.weekdayNote}</p>
              <div className="flex flex-col gap-4">
                {WEEKDAY_KEYS.map((dayKey) => (
                  <DayBookingList key={dayKey} dayKey={dayKey} dayLabel={l.linge.days[ALL_DAY_KEYS.indexOf(dayKey)]} bookings={state.laundryBookings} roommates={roommates} isEditor={isEditor} loggedInId={loggedInId} onCancel={cancelBooking} noBookingsLabel={l.linge.noBookings} cancelLabel={l.linge.cancelCta} />
                ))}
              </div>
            </div>

            {/* Week-end */}
            <div className="mt-10 pt-8" style={{ borderTop: "1px dashed #DCD1B6" }}>
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "1rem", color: "#2E2B26" }}>
                {l.linge.weekendTitle}
              </h3>
              <p className="mt-1 text-xs mb-4" style={{ color: "#A79B7D" }}>{l.linge.weekendNote}</p>
              <div className="flex flex-col gap-4">
                {WEEKEND_KEYS.map((dayKey) => (
                  <DayBookingList key={dayKey} dayKey={dayKey} dayLabel={l.linge.days[ALL_DAY_KEYS.indexOf(dayKey)]} bookings={state.laundryBookings} roommates={roommates} isEditor={isEditor} loggedInId={loggedInId} onCancel={cancelBooking} noBookingsLabel={l.linge.noBookings} cancelLabel={l.linge.cancelCta} />
                ))}
              </div>
            </div>
          </Paper>
        )}

        {tab === "taches" && (
          <TachesTab
            currentWeek={currentWeek}
            chores={state.chores}
            roommates={roommates}
            isEditor={isEditor}
            onAddChore={addChore}
            onRenameChore={renameChore}
            onRemoveChore={removeChore}
            l={l}
          />
        )}

        {tab === "courses" && (
          <Paper>
            <SectionTitle title={l.courses.title} subtitle={l.courses.subtitle} />
            {!canShop && <p className="mt-2 text-xs" style={{ color: "#A8503B" }}>{l.courses.needLogin}</p>}

            <div className="mt-6">
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "#2E2B26" }}>
                {l.courses.commonTitle}
              </h3>
              <p className="mt-1 text-xs" style={{ color: "#A79B7D" }}>{l.courses.commonHint}</p>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2" style={shopStyle}>
                {state.commonItems.map((item) => {
                  const pendingItem = state.shopping.find((it) => it.commonIndex === item.id && !it.done);
                  const assignedTo = pendingItem ? roommates.find((r) => r.id === pendingItem.assignedBuyerId) : null;
                  return (
                    <button
                      key={item.id}
                      onClick={() => addCommonItem(item.id)}
                      className="rounded-sm px-2 py-2.5 flex flex-col items-center gap-1 text-center shadow-sm transition-transform hover:-translate-y-0.5"
                      style={{ background: "#FFFFFF", border: pendingItem ? `2px solid ${assignedTo?.color || "#E4DCC9"}` : "1px solid #E4DCC9" }}
                    >
                      <span className="text-xs font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#2E2B26" }}>{item.name}</span>
                      {pendingItem && assignedTo && (
                        <span className="text-[10px]" style={{ color: assignedTo.color, fontFamily: "'IBM Plex Mono', monospace" }}>
                          {l.courses.assignedPrefix} {assignedTo.name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {isEditor && (
                <div className="mt-4 pt-4" style={{ borderTop: "1px dashed #DCD1B6" }}>
                  <h4 className="mb-2 text-xs" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: "#7A7266" }}>
                    {l.courses.manageCommonTitle}
                  </h4>
                  <div className="flex flex-col gap-2">
                    {state.commonItems.map((item) => (
                      <ChoreEditor
                        key={item.id}
                        name={item.name}
                        onRename={(v) => renameCommonItemDef(item.id, v)}
                        onRemove={() => removeCommonItemDef(item.id)}
                        confirmLabel={l.coloc.confirm}
                        savedLabel={l.coloc.saved}
                      />
                    ))}
                  </div>
                  <AddChoreForm onAdd={addCommonItemDef} placeholder={l.courses.addCommonPlaceholder} cta={l.taches.addCta} />
                </div>
              )}
            </div>

            <div className="mt-6 pt-5" style={{ borderTop: "1px dashed #DCD1B6" }}>
              <h3 className="mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "0.85rem", color: "#7A7266" }}>
                {l.courses.otherTitle}
              </h3>
              <div className="flex gap-2" style={shopStyle}>
                <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addShoppingItem()} placeholder={l.courses.placeholder} className="flex-1 px-3 py-2 rounded-sm text-sm outline-none" style={{ border: "1px solid #DCD1B6", background: "#FFFFFF" }} />
                <button onClick={addShoppingItem} className="px-3 rounded-sm" style={{ background: "#2E2B26", color: "#F3EDE1" }}><Plus size={18} /></button>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              {state.shopping.length === 0 && <p className="text-sm" style={{ color: "#A79B7D" }}>{l.courses.empty}</p>}
              {state.shopping.map((it) => {
                const assignedTo = it.assignedBuyerId !== null ? roommates.find((r) => r.id === it.assignedBuyerId) : null;
                const canCheck = isEditor || it.commonIndex === null || it.assignedBuyerId === loggedInId;
                return (
                  <div key={it.id} className="flex items-center justify-between px-3 py-2 rounded-sm" style={{ background: "#FFFFFF", border: "1px solid #E4DCC9" }}>
                    <button onClick={() => toggleShoppingItem(it.id)} className="flex items-center gap-2 flex-1 text-left" style={{ ...shopStyle, ...(canCheck ? {} : { cursor: "default" }) }}>
                      <span className="w-5 h-5 rounded-sm flex items-center justify-center flex-shrink-0" style={{ background: it.done ? "#6B8F71" : "#F3EDE1", border: "1px solid #DCD1B6", opacity: canCheck ? 1 : 0.4 }}>
                        {it.done && <Check size={14} color="#FFF" />}
                      </span>
                      <span style={{ textDecoration: it.done ? "line-through" : "none", color: it.done ? "#A79B7D" : "#2E2B26" }}>{it.text}</span>
                      {!it.done && assignedTo && (
                        <span className="text-[10px]" style={{ color: assignedTo.color, fontFamily: "'IBM Plex Mono', monospace" }}>— {l.courses.assignedPrefix} {assignedTo.name}</span>
                      )}
                    </button>
                    <button onClick={() => removeShoppingItem(it.id)} style={shopStyle}><Trash2 size={16} color="#A79B7D" /></button>
                  </div>
                );
              })}
            </div>
          </Paper>
        )}

        {tab === "historique" && (
          <Paper>
            <SectionTitle title={l.historique.title} subtitle={l.historique.subtitle} />

            <div className="mt-8">
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "#2E2B26" }}>
                {l.historique.summaryTitle}
              </h3>
              <div className="mt-4 flex flex-col gap-2">
                {(() => {
                  const counts = roommates.map((r) => state.commonPurchases[r.id] || 0);
                  const maxCount = Math.max(1, ...counts);
                  return roommates.map((r) => {
                    const count = state.commonPurchases[r.id] || 0;
                    return (
                      <div key={r.id} className="flex items-center gap-3">
                        <span className="w-20 text-sm flex-shrink-0 truncate" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#2E2B26" }}>{r.name}</span>
                        <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: "#EFE7D6" }}>
                          <div className="h-full rounded-full" style={{ width: `${(count / maxCount) * 100}%`, background: r.color, minWidth: count > 0 ? "6px" : "0" }} />
                        </div>
                        <span className="w-20 text-right text-xs flex-shrink-0" style={{ color: "#A79B7D", fontFamily: "'IBM Plex Mono', monospace" }}>{l.historique.itemsCount(count)}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            <div className="mt-10 pt-8" style={{ borderTop: "1px dashed #DCD1B6" }}>
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: "0.95rem", color: "#2E2B26" }}>
                {l.historique.logTitle}
              </h3>
              <div className="mt-4 flex flex-col gap-2">
                {state.purchaseHistory.length === 0 && <p className="text-sm" style={{ color: "#A79B7D" }}>{l.historique.empty}</p>}
                {state.purchaseHistory.map((h) => {
                  const buyer = roommates.find((r) => r.id === h.buyerId);
                  const dateStr = new Date(h.ts).toLocaleDateString(lang === "fr" ? "fr-FR" : "de-DE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
                  if (isEditor) {
                    return (
                      <HistoryEntryEditor
                        key={h.id}
                        entry={h}
                        buyer={buyer}
                        dateStr={dateStr}
                        roommates={roommates}
                        onSave={(text, buyerId) => editHistoryEntry(h.id, text, buyerId)}
                        onRemove={() => removeHistoryEntry(h.id)}
                        confirmLabel={l.coloc.confirm}
                        savedLabel={l.coloc.saved}
                      />
                    );
                  }
                  return (
                    <div key={h.id} className="flex items-center justify-between px-3 py-2 rounded-sm" style={{ background: "#FFFFFF", border: "1px solid #E4DCC9" }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: buyer?.color || "#A79B7D" }} />
                        <span className="truncate" style={{ color: "#2E2B26" }}>{h.itemText}</span>
                        <span className="text-xs flex-shrink-0" style={{ color: "#A79B7D" }}>— {h.buyerName || buyer?.name}</span>
                      </div>
                      <span className="text-xs flex-shrink-0" style={{ color: "#A79B7D", fontFamily: "'IBM Plex Mono', monospace" }}>{dateStr}</span>
                    </div>
                  );
                })}
              </div>

              {isEditor && (
                <div className="mt-5 pt-5" style={{ borderTop: "1px dashed #DCD1B6" }}>
                  <h4 className="mb-2 text-xs" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: "#7A7266" }}>
                    {l.historique.addManualTitle}
                  </h4>
                  <ManualHistoryForm roommates={roommates} onAdd={addManualHistoryEntry} placeholder={l.historique.addManualPlaceholder} cta={l.historique.addCta} />
                </div>
              )}
            </div>
          </Paper>
        )}

        {tab === "coloc" && (
          <Paper>
            <SectionTitle title={l.coloc.title} subtitle={l.coloc.subtitle} />
            <div className="mt-6 flex flex-col gap-3" style={lockStyle}>
              {roommates.map((r) => (
                <div key={r.id} className="px-3 py-2.5 rounded-sm flex items-center gap-2" style={{ background: "#FFFFFF", border: "1px solid #E4DCC9" }}>
                  <div className="flex-1 min-w-0">
                    <NameCodeEditor
                      name={r.name}
                      pin={r.pin}
                      onSave={(n, p) => saveRoommateProfile(r.id, n, p)}
                      nameLabel={l.coloc.nameLabel}
                      pinLabel={l.coloc.pinLabel}
                      confirmLabel={l.coloc.confirm}
                      savedLabel={l.coloc.saved}
                      dotColor={r.color}
                    />
                  </div>
                  <button onClick={() => removeRoommate(r.id)} className="flex-shrink-0"><Trash2 size={16} color="#A79B7D" /></button>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-6" style={{ borderTop: "1px dashed #DCD1B6" }}>
              <h4 className="mb-2 text-xs" style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: "#7A7266" }}>
                {l.coloc.addTitle}
              </h4>
              <AddRoommateForm onAdd={addRoommate} nameLabel={l.coloc.nameLabel} pinLabel={l.coloc.pinLabel} cta={l.taches.addCta} />
            </div>
          </Paper>
        )}
      </div>
    </div>
  );
}

function Header({ title }) {
  return (
    <div className="relative mb-2">
      <div className="absolute -top-2 left-4 w-16 h-4 opacity-70 rotate-[-3deg]" style={{ background: "#C99A2E" }} />
      <h1 className="relative text-3xl" style={{ fontFamily: "'Caveat', cursive", color: "#2E2B26", fontWeight: 700 }}>{title}</h1>
    </div>
  );
}
