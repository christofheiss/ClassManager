// core.js — reine, DOM-freie Logik (Parsing, Validierung, Team-Verteilung).
// Wird im Browser als window.TG genutzt und in Node (Tests) via module.exports.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.TG = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const TIME_RE = /^\d{2}:\d{2}$/;
    const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const WEEKDAYS_FULL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    const REASON_CATEGORIES = ['Krank', 'Verletzt', 'Entschuldigt', 'Schnuppern', 'Unentschuldigt', 'Sonstiges'];
    // Anwesenheits-Status: 'injured' = anwesend, kann aber nicht aktiv mitmachen (z.B. verletzt).
    const ATTENDANCE_STATUSES = ['present', 'absent', 'injured'];

    // Nur diese Werte dürfen je in s.gender landen. 'unknown' = ohne Angabe (zählt bei der
    // Verteilung neutral); alles Unbekannte fällt darauf zurück.
    const GENDERS = ['female', 'male', 'diverse', 'unknown'];
    function sanitizeGender(g) { return GENDERS.includes(g) ? g : 'unknown'; }
    function sanitizeStatus(s) { return (s === 'absent' || s === 'injured') ? s : 'present'; }

    // HOBBYS/SPORTARTEN — freie Texteingabe ("Fussball, Tennis"), normalisiert und dedupliziert.
    function parseHobbies(text) {
        return sanitizeHobbies(String(text || '').split(/[,;/]+/));
    }
    function sanitizeHobbies(list) {
        if (!Array.isArray(list)) return [];
        const out = [];
        for (const h of list) {
            if (typeof h !== 'string') continue;
            const t = h.trim().slice(0, 30);
            if (!t) continue;
            if (!out.some(o => o.toLowerCase() === t.toLowerCase())) out.push(t);
            if (out.length >= 20) break;
        }
        return out;
    }

    function todayStr() {
        const d = new Date();
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }
    function getWeekdayIndex(dateStr) {
        return (new Date(dateStr + 'T00:00:00').getDay() + 6) % 7;
    }
    // Schweizer Schuljahr: Semester 1 = August–Januar, Semester 2 = Februar–Juli.
    function getSemester(dateStr) {
        const month = parseInt(dateStr.slice(5, 7), 10);
        return (month >= 8 || month === 1) ? 1 : 2;
    }
    function formatDateDisplay(dateStr) {
        const [y, m, d] = dateStr.split('-');
        return `${d}.${m}.${y}`;
    }

    // BULK PARSER — Tags am Zeilenende: Geschlecht (m/w/d) und/oder s = sportlich,
    // kombiniert ("Max ms") oder als getrennte Tokens in beliebiger Reihenfolge
    // ("Max m s", "Max m (s)", "Max (m) (s)"). Nur KLEIN geschriebene Tags zählen
    // ("Max m"); Grossbuchstaben bleiben Namensbestandteil ("Anna M" = Name mit
    // Initial). In Klammern ist Gross-/Kleinschreibung egal: "Anna (M)".
    // Optionales Klassenkürzel in eckigen Klammern am Ende: "Max m s [7a]".
    function bulkParse(text, addFn) {
        const entries = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        let added = 0, skipped = 0, defaults = 0;
        entries.forEach(entry => {
            let classTag = '';
            const tagMatch = entry.match(/\s*\[([^\]]{1,20})\]$/);
            if (tagMatch) { classTag = tagMatch[1].trim(); entry = entry.slice(0, tagMatch.index).trim(); }
            let gender = 'unknown', sporty = false, rest = entry;
            let genderSet = false, sportySet = false, tagCount = 0;
            for (let iter = 0; iter < 2; iter++) {
                let tag = null, tagIndex = -1;
                const paren = rest.match(/\s*\(([A-Za-z]{1,2})\)$/);
                if (paren && /^(?:[mwd]s?|s[mwd]?)$/i.test(paren[1])) {
                    tag = paren[1].toLowerCase(); tagIndex = paren.index;
                } else {
                    const plain = rest.match(/\s+((?:[mwd]s?)|(?:s[mwd]?))$/); // bewusst case-sensitiv
                    if (plain) { tag = plain[1]; tagIndex = plain.index; }
                }
                if (tag === null) break;
                const genderChar = (tag.match(/[mwd]/) || [null])[0];
                const hasSport = tag.includes('s');
                // Doppeltes Merkmal (z.B. zwei Geschlechts-Tags) → das zweite Token gehört zum Namen.
                if ((genderChar && genderSet) || (hasSport && sportySet)) break;
                if (genderChar) {
                    gender = genderChar === 'm' ? 'male' : genderChar === 'd' ? 'diverse' : 'female';
                    genderSet = true;
                }
                if (hasSport) { sporty = true; sportySet = true; }
                rest = rest.slice(0, tagIndex).trim();
                tagCount++;
            }
            const cleanName = rest.replace(/[\s,:\-]+$/, '').trim();
            if (!cleanName) return;
            if (tagCount === 0) defaults++;
            if (addFn(cleanName, gender, sporty, classTag)) added++; else skipped++;
        });
        return { added, skipped, defaults };
    }

    // CSV-ZEILEN — Excel liefert je nach Region ";" oder ",", teils Tabs, setzt Felder mit
    // Trennzeichen in Anführungszeichen ("Notiz, mit Komma") und schreibt ein BOM an den Dateianfang.
    // Pro Zeile gilt das erste vorkommende Trennzeichen in der Reihenfolge ";" → Tab → ",".
    function csvLines(text) {
        return String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    }
    function splitCsvLine(line) {
        const delim = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
        const out = [];
        let cur = '', quoted = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (quoted) {
                if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (ch === '"') quoted = false;
                else cur += ch;
            } else if (ch === '"' && cur.trim() === '') { cur = ''; quoted = true; }
            else if (ch === delim) { out.push(cur.trim()); cur = ''; }
            else cur += ch;
        }
        out.push(cur.trim());
        return out;
    }

    // CSV/TXT-Import: "Klasse;Name;Geschlecht;Sportlich;Kürzel;Hobbys" pro Zeile.
    // Hobbys innerhalb der Spalte mit "/" trennen (Komma ist Spalten-Trenner).
    // Eine Kopfzeile (wie im Format-Beispiel) wird erkannt und übersprungen.
    function isCsvHeader(a, b) {
        return /^klasse$/i.test(a) && /^(name|sch(ü|ue)ler(in)?(nen)?|vorname)$/i.test(b || '');
    }
    function parseCsvImport(text) {
        const rows = [];
        csvLines(text).forEach((line, i) => {
            const parts = splitCsvLine(line);
            if (parts.length < 2) return;
            const [className, studentName, genderRaw, sportyRaw, classTagRaw, hobbiesRaw] = parts;
            if (!className || !studentName) return;
            if (i === 0 && isCsvHeader(className, studentName)) return;
            let gender = 'unknown';
            const g = (genderRaw || '').toLowerCase();
            if (g.startsWith('m')) gender = 'male';
            else if (g.startsWith('w') || g.startsWith('f')) gender = 'female';
            else if (g.startsWith('d')) gender = 'diverse';
            const sporty = /^(s|ja|x|1|sportlich|true)$/i.test(sportyRaw || '');
            const classTag = (classTagRaw || '').slice(0, 20).trim();
            const hobbies = parseHobbies(hobbiesRaw || '');
            rows.push({ className, studentName, gender, sporty, classTag, hobbies });
        });
        return rows;
    }

    // ANWESENHEITS-IMPORT (CSV aus Excel): "Datum;Name;Status;Grund;Notiz" pro Zeile.
    // Datum: JJJJ-MM-TT oder TT.MM.JJJJ. Status: anwesend/abwesend (auch ja/nein, 1/0,
    // present/absent, x = anwesend) oder verletzt/injured = anwesend, macht aber nicht mit.
    // Grund muss einer der bekannten Kategorien entsprechen, sonst wandert der Text in
    // die Notiz. Kopfzeile ("Datum;Name;…") wird übersprungen.
    function parseAttendanceCsv(text) {
        const rows = [], invalid = [];
        csvLines(text).forEach((line, i) => {
            const parts = splitCsvLine(line);
            if (parts.length < 3) { if (parts.join('')) invalid.push(line); return; }
            const [dateRaw, name, statusRaw, reasonRaw, noteRaw] = parts;
            if (i === 0 && /^datum$/i.test(dateRaw) && /^(name|sch(ü|ue)ler(in)?(nen)?)$/i.test(name || '')) return;
            let date = null;
            if (DATE_RE.test(dateRaw)) date = dateRaw;
            else {
                const m = dateRaw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
                if (m) date = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
            }
            const s = (statusRaw || '').toLowerCase();
            let status = null;
            if (/^(anwesend|present|ja|1|x|a)$/.test(s)) status = 'present';
            else if (/^(abwesend|absent|nein|0|fehlt)$/.test(s)) status = 'absent';
            else if (/^(verletzt|injured|zuschauen|zuschauend|dispensiert)$/.test(s)) status = 'injured';
            if (!date || !name || !status) { invalid.push(line); return; }
            let reasonCategory = '', note = typeof noteRaw === 'string' ? noteRaw : '';
            if (reasonRaw) {
                const cat = REASON_CATEGORIES.find(c => c.toLowerCase() === reasonRaw.toLowerCase());
                if (cat) reasonCategory = cat;
                else note = note ? `${reasonRaw} — ${note}` : reasonRaw;
            }
            rows.push({ date, name, status, reasonCategory, note });
        });
        return { rows, invalid };
    }

    // KLASSENPUNKTE — Punktestand = Summe der Punkte seit dem letzten Reset
    // (Reset = Punkte eingelöst, z.B. für eine Bonusstunde). Neben Lektionen gibt es
    // manuelle Anpassungen (type 'adjust', auch negativ, z.B. Startpunktestand);
    // der Stand fällt nie unter 0. Liefert den Verlauf pro Eintrag (für den Graphen).
    function computePointsSeries(entries) {
        const out = [];
        let total = 0;
        for (const e of (entries || [])) {
            let delta = 0;
            if (e.type === 'reset') total = 0;
            else {
                const p = (typeof e.points === 'number' && isFinite(e.points)) ? e.points : 0;
                delta = e.type === 'adjust' ? p : Math.max(0, p);
                total += delta;
                if (total < 0) total = 0;
            }
            out.push({ id: e.id, type: e.type || 'lektion', date: e.date, delta, total, note: e.note || '' });
        }
        return out;
    }
    function computePointsTotal(entries) {
        const series = computePointsSeries(entries);
        return series.length ? series[series.length - 1].total : 0;
    }

    // Schweizer Notenformel: Note = 5 × Punkte/Max + 1, begrenzt auf 1–6, auf Zehntel gerundet.
    function pointsToGrade(points, maxPoints) {
        if (typeof points !== 'number' || !isFinite(points) || typeof maxPoints !== 'number' || !(maxPoints > 0)) return null;
        const grade = 5 * points / maxPoints + 1;
        return Math.round(Math.min(6, Math.max(1, grade)) * 10) / 10;
    }

    // Führendes '='/'+'/'-'/'@' würde in Excel/LibreOffice als Formel ausgeführt (CSV-Injection).
    function escapeCsv(v) {
        let s = String(v).replace(/"/g, '""');
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return `"${s}"`;
    }

    // EINDEUTIGE ANZEIGENAMEN — kombiniert man Klassen, kann es zwei "Anna" geben. Doppelte Namen
    // erhalten die Klasse in Klammern ("Anna (7a)"), bleibt es doppelt, eine laufende Nummer.
    // Wichtig, weil "Nicht zusammen"-Regeln und die Anzeige über den Namen laufen.
    function uniqueDisplayNames(items) {
        const key = n => n.trim().toLowerCase();
        const count = list => list.reduce((m, n) => m.set(key(n), (m.get(key(n)) || 0) + 1), new Map());
        const base = items.map(it => it.name);
        const groups = new Map();
        items.forEach(it => { const k = key(it.name); if (!groups.has(k)) groups.set(k, new Set()); groups.get(k).add(it.group || ''); });
        const withGroup = items.map((it, i) => groups.get(key(base[i])).size > 1 && it.group ? `${base[i]} (${it.group})` : base[i]);
        const c2 = count(withGroup), seen = new Map();
        return withGroup.map(n => {
            if (c2.get(key(n)) < 2) return n;
            const k = key(n), nr = (seen.get(k) || 0) + 1;
            seen.set(k, nr);
            return nr === 1 ? n : `${n} ${nr}`;
        });
    }

    // TEAM-VERTEILUNG
    function shuffleArray(arr, rng) {
        const random = rng || Math.random;
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        return a;
    }

    // Sport-Stärke einer Person für die Verteilung: standardmässig 1 = sportlich, 0 = nicht.
    // Bei einer konkreten Sportart liefert ein eigenes sportLevelOf z.B. 2 = spielt diese
    // Sportart (Hobby), 1 = allgemein sportlich, 0 = keins von beidem.
    function defaultSportLevel(p) { return p.sporty === true ? 1 : 0; }

    function distributeTeams(list, n, opts) {
        const { balanceGender = false, balanceSport = false, rng, sportLevelOf } = opts || {};
        const levelOf = sportLevelOf || defaultSportLevel;
        let teams = Array.from({ length: n }, () => []);
        const shuf = shuffleArray(list, rng);
        if (balanceGender || balanceSport) {
            // Personen in Gruppen mit gleichen Ausgleichs-Merkmalen aufteilen und diese
            // mit fortlaufendem Index über die Teams verteilen: so landet jede Gruppe
            // (z.B. "sportlich + weiblich") möglichst gleichmässig in allen Teams.
            const sportKeys = balanceSport ? [...new Set(shuf.map(levelOf))].sort((a, b) => b - a) : [null];
            const genderKeys = balanceGender ? GENDERS : [null];
            const strata = [];
            sportKeys.forEach(sp => genderKeys.forEach(g => {
                strata.push(shuf.filter(p =>
                    (sp === null || levelOf(p) === sp) &&
                    (g === null || p.gender === g)));
            }));
            let idx = 0;
            strata.forEach(grp => grp.forEach(p => { teams[idx].push(p); idx = (idx + 1) % n; }));
            teams = teams.map(t => shuffleArray(t, rng));
        } else {
            shuf.forEach((p, i) => teams[i % n].push(p));
        }
        // Die Verteilung beginnt immer bei Team 1 — ohne Durchmischen bekäme Team 1 stets den
        // Überschuss (grösseres Team, mehr Sportliche). Team-Reihenfolge deshalb zufällig wählen.
        return shuffleArray(teams, rng);
    }

    // "Nicht zusammen"-Paare: versucht Verstösse durch Tauschen zweier Personen zu
    // beheben. Bei balanceStrict wird zuerst ein Tauschpartner mit gleichen Merkmalen
    // (Geschlecht + Sport-Stärke) gesucht, damit die Balance erhalten bleibt.
    function enforceApart(teams, pairs, opts) {
        const { balanceStrict = false, sportLevelOf } = opts || {};
        const levelOf = sportLevelOf || defaultSportLevel;
        const key = name => String(name).trim().toLowerCase();
        const pairKey = (a, b) => [key(a), key(b)].sort().join('\u0000');
        const conflictSet = new Set((pairs || []).map(([a, b]) => pairKey(a, b)));
        if (conflictSet.size === 0) return { teams, unresolved: false };
        const inConflict = (a, b) => conflictSet.has(pairKey(a.name, b.name));
        const wouldConflict = (team, person, ignoreIdx) =>
            team.some((m, idx) => idx !== ignoreIdx && inConflict(m, person));
        const findViolation = () => {
            for (let t = 0; t < teams.length; t++) {
                const team = teams[t];
                for (let i = 0; i < team.length; i++)
                    for (let j = i + 1; j < team.length; j++)
                        if (inConflict(team[i], team[j])) return { t, i: j };
            }
            return null;
        };
        let guard = 0;
        while (guard++ < 200) {
            const v = findViolation();
            if (!v) return { teams, unresolved: false };
            const p = teams[v.t][v.i];
            let swapped = false;
            const modes = balanceStrict ? [true, false] : [false];
            outer:
            for (const strict of modes) {
                for (let t2 = 0; t2 < teams.length; t2++) {
                    if (t2 === v.t) continue;
                    for (let j = 0; j < teams[t2].length; j++) {
                        const q = teams[t2][j];
                        if (strict && (q.gender !== p.gender || levelOf(q) !== levelOf(p))) continue;
                        if (wouldConflict(teams[t2], p, j)) continue;
                        if (wouldConflict(teams[v.t], q, v.i)) continue;
                        teams[v.t][v.i] = q; teams[t2][j] = p;
                        swapped = true; break outer;
                    }
                }
            }
            if (!swapped) return { teams, unresolved: true };
        }
        return { teams, unresolved: true };
    }

    // BACKUP-VALIDIERUNG — prüft und normalisiert eine Backup-Datei;
    // gibt null zurück, wenn die Struktur nicht passt.
    function cleanPersonLike(s) {
        if (!s || typeof s !== 'object' || !Number.isInteger(s.id) || typeof s.name !== 'string' || !s.name.trim()) return null;
        return {
            id: s.id, name: s.name.trim(), gender: sanitizeGender(s.gender), sporty: s.sporty === true,
            classTag: typeof s.classTag === 'string' ? s.classTag.slice(0, 20).trim() : '',
            hobbies: sanitizeHobbies(s.hobbies)
        };
    }
    function validateBackup(data) {
        if (!data || typeof data !== 'object' || !Array.isArray(data.classes)) return null;
        const cleanClasses = [];
        let maxClassId = 0, maxStuId = 0, maxPersonId = 0, maxExamId = 0;
        for (const cls of data.classes) {
            if (!cls || typeof cls !== 'object') return null;
            const id = Number.isInteger(cls.id) && cls.id > 0 ? cls.id : null;
            const name = typeof cls.name === 'string' ? cls.name.trim() : '';
            if (id === null || !name) return null;
            const students = [];
            for (const s of (Array.isArray(cls.students) ? cls.students : [])) {
                const clean = cleanPersonLike(s);
                if (!clean) continue;
                students.push(clean);
                if (clean.id > maxStuId) maxStuId = clean.id;
            }
            const formerStudents = [];
            for (const s of (Array.isArray(cls.formerStudents) ? cls.formerStudents : [])) {
                const clean = cleanPersonLike(s);
                if (!clean) continue;
                formerStudents.push(clean);
                if (clean.id > maxStuId) maxStuId = clean.id;
            }
            const schedule = (Array.isArray(cls.schedule) ? cls.schedule : [])
                .filter(e => e && Number.isInteger(e.weekday) && e.weekday >= 0 && e.weekday <= 6 && typeof e.time === 'string' && TIME_RE.test(e.time))
                .map(e => ({ weekday: e.weekday, time: e.time }));
            cleanClasses.push({ id, name, students, formerStudents, schedule, collectsPoints: cls.collectsPoints === true, kind: ['sport', 'room'].includes(cls.kind) ? cls.kind : 'both' });
            if (id > maxClassId) maxClassId = id;
        }
        const cleanAttendance = {};
        if (data.attendanceData && typeof data.attendanceData === 'object' && !Array.isArray(data.attendanceData)) {
            for (const [classIdKey, sessions] of Object.entries(data.attendanceData)) {
                if (!cleanClasses.find(c => String(c.id) === classIdKey)) continue;
                if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) continue;
                const cleanSessions = {};
                for (const [dateKey, session] of Object.entries(sessions)) {
                    if (!DATE_RE.test(dateKey) || !session || typeof session !== 'object') continue;
                    const records = {};
                    if (session.records && typeof session.records === 'object' && !Array.isArray(session.records)) {
                        for (const [stuKey, rec] of Object.entries(session.records)) {
                            if (!rec || typeof rec !== 'object') continue;
                            records[stuKey] = {
                                status: sanitizeStatus(rec.status),
                                reasonCategory: REASON_CATEGORIES.includes(rec.reasonCategory) ? rec.reasonCategory : '',
                                note: typeof rec.note === 'string' ? rec.note : ''
                            };
                        }
                    }
                    cleanSessions[dateKey] = { date: dateKey, weekday: getWeekdayIndex(dateKey), records };
                }
                if (Object.keys(cleanSessions).length) cleanAttendance[classIdKey] = cleanSessions;
            }
        }
        const cleanPersons = [];
        for (const p of (Array.isArray(data.persons) ? data.persons : [])) {
            const clean = cleanPersonLike(p);
            if (!clean) continue;
            cleanPersons.push(clean);
            if (clean.id > maxPersonId) maxPersonId = clean.id;
        }
        const cleanApart = [];
        for (const p of (Array.isArray(data.apartPairs) ? data.apartPairs : [])) {
            if (Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string' && p[0].trim() && p[1].trim()) cleanApart.push([p[0], p[1]]);
        }
        // Prüfungen: { [classId]: [ { id, title, date, mode:'points'|'grades', maxPoints, results:{studentId:Zahl} } ] }
        // Punkte-Modus braucht ein gültiges Maximum; Noten müssen im Bereich 1–6 liegen.
        const cleanExams = {};
        if (data.exams && typeof data.exams === 'object' && !Array.isArray(data.exams)) {
            for (const [classIdKey, list] of Object.entries(data.exams)) {
                if (!cleanClasses.find(c => String(c.id) === classIdKey)) continue;
                if (!Array.isArray(list)) continue;
                const cleanList = [];
                for (const ex of list) {
                    if (!ex || typeof ex !== 'object' || !Number.isInteger(ex.id) || ex.id <= 0) continue;
                    const title = typeof ex.title === 'string' ? ex.title.trim() : '';
                    if (!title || typeof ex.date !== 'string' || !DATE_RE.test(ex.date)) continue;
                    const mode = ex.mode === 'points' ? 'points' : 'grades';
                    const maxPoints = typeof ex.maxPoints === 'number' && isFinite(ex.maxPoints) && ex.maxPoints > 0 ? ex.maxPoints : null;
                    if (mode === 'points' && maxPoints === null) continue;
                    const results = {};
                    if (ex.results && typeof ex.results === 'object' && !Array.isArray(ex.results)) {
                        for (const [stuKey, v] of Object.entries(ex.results)) {
                            if (typeof v !== 'number' || !isFinite(v) || v < 0) continue;
                            if (mode === 'grades' && (v < 1 || v > 6)) continue;
                            results[stuKey] = v;
                        }
                    }
                    cleanList.push({ id: ex.id, title, date: ex.date, mode, maxPoints: mode === 'points' ? maxPoints : null, results });
                    if (ex.id > maxExamId) maxExamId = ex.id;
                }
                if (cleanList.length) cleanExams[classIdKey] = cleanList;
            }
        }
        // Klassenpunkte: { [classId]: { goals: [{id,text,points}], entries: [{id,type,date,goalIds,note,points}] } }
        const cleanPoints = {};
        let maxPointsId = 0;
        if (data.pointsData && typeof data.pointsData === 'object' && !Array.isArray(data.pointsData)) {
            for (const [classIdKey, pd] of Object.entries(data.pointsData)) {
                if (!cleanClasses.find(c => String(c.id) === classIdKey)) continue;
                if (!pd || typeof pd !== 'object') continue;
                const goals = [];
                for (const g of (Array.isArray(pd.goals) ? pd.goals : [])) {
                    if (!g || typeof g !== 'object' || !Number.isInteger(g.id) || g.id <= 0) continue;
                    const text = typeof g.text === 'string' ? g.text.trim().slice(0, 120) : '';
                    if (!text) continue;
                    const points = Number.isInteger(g.points) && g.points >= 1 && g.points <= 10 ? g.points : 1;
                    goals.push({ id: g.id, text, points });
                    if (g.id > maxPointsId) maxPointsId = g.id;
                }
                const entries = [];
                for (const e of (Array.isArray(pd.entries) ? pd.entries : [])) {
                    if (!e || typeof e !== 'object' || !Number.isInteger(e.id) || e.id <= 0) continue;
                    if (typeof e.date !== 'string' || !DATE_RE.test(e.date)) continue;
                    if (e.type === 'reset') { entries.push({ id: e.id, type: 'reset', date: e.date }); }
                    else if (e.type === 'adjust') {
                        let points = typeof e.points === 'number' && isFinite(e.points) ? e.points : 0;
                        points = Math.max(-9999, Math.min(9999, points));
                        entries.push({ id: e.id, type: 'adjust', date: e.date, note: typeof e.note === 'string' ? e.note.slice(0, 200) : '', points });
                    }
                    else {
                        const points = typeof e.points === 'number' && isFinite(e.points) && e.points >= 0 ? e.points : 0;
                        const goalIds = (Array.isArray(e.goalIds) ? e.goalIds : []).filter(x => Number.isInteger(x));
                        entries.push({ id: e.id, type: 'lektion', date: e.date, goalIds, note: typeof e.note === 'string' ? e.note.slice(0, 200) : '', points });
                    }
                    if (e.id > maxPointsId) maxPointsId = e.id;
                }
                if (goals.length || entries.length) cleanPoints[classIdKey] = { goals, entries };
            }
        }
        // Sitzordnungen: { [classId]: { current: Plan|null, saved: [ { id, name, ...Plan } ], layouts: [ Tischanordnungen ohne Personen ] } }
        const cleanSeating = {};
        let maxSeatId = 0;
        if (data.seatingData && typeof data.seatingData === 'object' && !Array.isArray(data.seatingData)) {
            for (const [classIdKey, sd] of Object.entries(data.seatingData)) {
                const cls = cleanClasses.find(c => String(c.id) === classIdKey);
                if (!cls || !sd || typeof sd !== 'object') continue;
                const ids = new Set(cls.students.map(st => st.id));
                const current = cleanSeatingPlan(sd.current, ids);
                const saved = [];
                for (const sp of (Array.isArray(sd.saved) ? sd.saved : [])) {
                    const plan = cleanSeatingPlan(sp, ids);
                    const name = sp && typeof sp.name === 'string' ? sp.name.trim().slice(0, 60) : '';
                    if (!plan || !name || !Number.isInteger(sp.id) || sp.id <= 0) continue;
                    saved.push({ id: sp.id, name, ...plan });
                    if (sp.id > maxSeatId) maxSeatId = sp.id;
                }
                const layouts = [];
                for (const lp of (Array.isArray(sd.layouts) ? sd.layouts : [])) {
                    const plan = cleanSeatingPlan(lp, new Set());
                    const name = lp && typeof lp.name === 'string' ? lp.name.trim().slice(0, 60) : '';
                    if (!plan || !name || !Number.isInteger(lp.id) || lp.id <= 0) continue;
                    layouts.push({ id: lp.id, name, ...plan });
                    if (lp.id > maxSeatId) maxSeatId = lp.id;
                }
                if (current || saved.length || layouts.length) cleanSeating[classIdKey] = { current, saved, layouts };
            }
        }
        return {
            classes: cleanClasses,
            pointsData: cleanPoints,
            seatingData: cleanSeating,
            seatingIdCounter: Math.max(Number.isInteger(data.seatingIdCounter) ? data.seatingIdCounter : 1, maxSeatId + 1),
            pointsIdCounter: Math.max(Number.isInteger(data.pointsIdCounter) ? data.pointsIdCounter : 1, maxPointsId + 1),
            classIdCounter: Math.max(Number.isInteger(data.classIdCounter) ? data.classIdCounter : 1, maxClassId + 1),
            stuIdCounter: Math.max(Number.isInteger(data.stuIdCounter) ? data.stuIdCounter : 1, maxStuId + 1),
            attendanceData: cleanAttendance,
            persons: cleanPersons,
            personIdCounter: Math.max(Number.isInteger(data.personIdCounter) ? data.personIdCounter : 1, maxPersonId + 1),
            apartPairs: cleanApart,
            exams: cleanExams,
            examIdCounter: Math.max(Number.isInteger(data.examIdCounter) ? data.examIdCounter : 1, maxExamId + 1),
            exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : null
        };
    }


    // SITZORDNUNG
    // Plan: { cols, rows, desks: [ { x, y, s: Schüler-ID|null, l: fixiert? } ] }
    const SEAT_MAX_COLS = 16, SEAT_MAX_ROWS = 12;

    function cleanSeatingPlan(plan, validIds) {
        if (!plan || typeof plan !== 'object') return null;
        const cols = Number.isInteger(plan.cols) ? Math.min(SEAT_MAX_COLS, Math.max(2, plan.cols)) : 8;
        const rows = Number.isInteger(plan.rows) ? Math.min(SEAT_MAX_ROWS, Math.max(2, plan.rows)) : 6;
        const seen = new Set(), used = new Set(), desks = [];
        for (const d of (Array.isArray(plan.desks) ? plan.desks : [])) {
            if (!d || !Number.isInteger(d.x) || !Number.isInteger(d.y) || d.x < 0 || d.y < 0 || d.x >= cols || d.y >= rows) continue;
            const key = d.x + ',' + d.y;
            if (seen.has(key)) continue;
            seen.add(key);
            let s = Number.isInteger(d.s) && (!validIds || validIds.has(d.s)) && !used.has(d.s) ? d.s : null;
            if (s !== null) used.add(s);
            desks.push({ x: d.x, y: d.y, s, l: d.l === true && s !== null });
        }
        return { cols, rows, desks };
    }

    // Verteilt Schüler(innen) auf die Tische. Fixierte Tische behalten ihre Person; alle anderen
    // Tische werden neu belegt. students: [{id, gender}]. opts: { mixGender, apart: [[idA,idB],...], rng }.
    // Gütemass: gleiches Geschlecht nebeneinander (Strafe 1), "nicht zusammen"-Paare in der
    // Nachbarschaft inkl. Diagonale und davor/dahinter (Strafe 20). Zufallsstart + Verbesserung durch Tauschen.
    function generateSeating(desks, students, opts) {
        const o = opts || {};
        const rng = o.rng || Math.random;
        const out = desks.map(d => ({ x: d.x, y: d.y, s: d.l === true && d.s != null ? d.s : null, l: d.l === true && d.s != null }));
        const fixedIds = new Set(out.filter(d => d.s !== null).map(d => d.s));
        const toPlace = students.filter(st => !fixedIds.has(st.id));
        const free = out.filter(d => !d.l);
        if (toPlace.length > free.length) {
            return { desks: desks.map(d => ({ ...d })), unplaced: toPlace.length - free.length, ok: false };
        }
        const gender = {};
        students.forEach(st => { gender[st.id] = st.gender; });
        const apart = (o.apart || []).filter(p => Array.isArray(p) && p.length === 2);
        const byPos = new Map(out.map(d => [d.x + ',' + d.y, d]));
        const pairs = []; // Nachbarpaare (Tische): 'h' = direkt nebeneinander, 'a' = Umgebung
        const pairsOf = new Map(out.map(d => [d, []]));
        const addPair = (a, b, kind) => { const p = [a, b, kind]; pairs.push(p); pairsOf.get(a).push(p); pairsOf.get(b).push(p); };
        out.forEach(d => {
            const right = byPos.get((d.x + 1) + ',' + d.y);
            if (right) addPair(d, right, 'h');
            [[0, 1], [1, 1], [-1, 1]].forEach(([dx, dy]) => {
                const n = byPos.get((d.x + dx) + ',' + (d.y + dy));
                if (n) addPair(d, n, 'a');
            });
        });
        const apartSet = new Set(apart.map(p => Math.min(p[0], p[1]) + '|' + Math.max(p[0], p[1])));
        function pairCost([a, b, kind]) {
            if (a.s === null || b.s === null) return 0;
            let sc = 0;
            if (kind === 'h' && o.mixGender && gender[a.s] === gender[b.s] && gender[a.s] !== 'unknown') sc += 1;
            if (apartSet.size && apartSet.has(Math.min(a.s, b.s) + '|' + Math.max(a.s, b.s))) sc += 20;
            return sc;
        }
        // Kosten aller Paare, die Tisch a oder b berühren (das Paar a–b nur einmal)
        function localCost(a, b) {
            let sc = 0;
            for (const p of pairsOf.get(a)) sc += pairCost(p);
            for (const p of pairsOf.get(b)) if (p[0] !== a && p[1] !== a) sc += pairCost(p);
            return sc;
        }
        // Zufällige Anfangsbelegung
        const slots = shuffleArray(free, rng);
        const order = shuffleArray(toPlace, rng);
        free.forEach(d => { d.s = null; });
        order.forEach((st, i) => { slots[i].s = st.id; });
        let best = pairs.reduce((sum, p) => sum + pairCost(p), 0);
        const needOpt = (o.mixGender || apartSet.size) && toPlace.length > 1;
        if (needOpt) {
            // Zufällige Tausche; behalten, wenn es nicht schlechter wird. Nur die betroffenen
            // Nachbarschaften werden neu bewertet, daher auch bei grossen Rastern schnell.
            const n = free.length;
            for (let it = 0; it < 6000 && best > 0; it++) {
                const a = free[Math.floor(rng() * n)], b = free[Math.floor(rng() * n)];
                if (a === b || (a.s === null && b.s === null)) continue;
                const before = localCost(a, b);
                [a.s, b.s] = [b.s, a.s];
                const delta = localCost(a, b) - before;
                if (delta <= 0) best += delta; else [a.s, b.s] = [b.s, a.s];
            }
        }
        return { desks: out.map(d => ({ x: d.x, y: d.y, s: d.s, l: d.l })), unplaced: 0, ok: true, penalty: best };
    }

    return {
        DATE_RE, TIME_RE, GENDERS, WEEKDAYS, WEEKDAYS_FULL, REASON_CATEGORIES, ATTENDANCE_STATUSES,
        sanitizeGender, sanitizeStatus, parseHobbies, sanitizeHobbies,
        todayStr, getWeekdayIndex, getSemester, formatDateDisplay,
        bulkParse, isCsvHeader, splitCsvLine, parseCsvImport, parseAttendanceCsv, escapeCsv, pointsToGrade, computePointsTotal, computePointsSeries,
        uniqueDisplayNames, shuffleArray, distributeTeams, enforceApart,
        cleanSeatingPlan, generateSeating,
        validateBackup
    };
});
