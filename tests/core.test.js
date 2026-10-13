const test = require('node:test');
const assert = require('node:assert/strict');
const TG = require('../core.js');

// --- sanitizeGender ---
test('sanitizeGender lässt nur gültige Werte durch', () => {
    assert.equal(TG.sanitizeGender('female'), 'female');
    assert.equal(TG.sanitizeGender('male'), 'male');
    assert.equal(TG.sanitizeGender('diverse'), 'diverse');
    assert.equal(TG.sanitizeGender('<img onerror=x>'), 'diverse');
    assert.equal(TG.sanitizeGender(undefined), 'diverse');
});

// --- getSemester (Schweizer Schuljahr) ---
test('getSemester: Aug–Jan = 1, Feb–Jul = 2', () => {
    assert.equal(TG.getSemester('2025-08-15'), 1);
    assert.equal(TG.getSemester('2025-12-01'), 1);
    assert.equal(TG.getSemester('2026-01-31'), 1);
    assert.equal(TG.getSemester('2026-02-01'), 2);
    assert.equal(TG.getSemester('2026-07-10'), 2);
});

test('getWeekdayIndex: Montag = 0, Sonntag = 6', () => {
    assert.equal(TG.getWeekdayIndex('2026-06-29'), 0); // Montag
    assert.equal(TG.getWeekdayIndex('2026-07-05'), 6); // Sonntag
});

// --- bulkParse ---
function collect(text) {
    const out = [];
    const res = TG.bulkParse(text, (name, gender, sporty) => { out.push({ name, gender, sporty }); return true; });
    return { out, res };
}

test('bulkParse: Kleinbuchstaben-Tags werden erkannt', () => {
    const { out } = collect('Max m\nAnna w\nKim d\nLea ms');
    assert.deepEqual(out, [
        { name: 'Max', gender: 'male', sporty: false },
        { name: 'Anna', gender: 'female', sporty: false },
        { name: 'Kim', gender: 'diverse', sporty: false },
        { name: 'Lea', gender: 'male', sporty: true }
    ]);
});

test('bulkParse: "s" allein = sportlich, Standard weiblich', () => {
    const { out } = collect('Mia s');
    assert.deepEqual(out, [{ name: 'Mia', gender: 'female', sporty: true }]);
});

test('bulkParse: Grossbuchstaben-Initialen bleiben Namensbestandteil', () => {
    const { out, res } = collect('Anna M\nMia S');
    assert.deepEqual(out, [
        { name: 'Anna M', gender: 'female', sporty: false },
        { name: 'Mia S', gender: 'female', sporty: false }
    ]);
    assert.equal(res.defaults, 2);
});

test('bulkParse: Klammer-Tags sind case-insensitiv', () => {
    const { out } = collect('Anna (M)\nLea (ws)\nKim (D)');
    assert.deepEqual(out, [
        { name: 'Anna', gender: 'male', sporty: false },
        { name: 'Lea', gender: 'female', sporty: true },
        { name: 'Kim', gender: 'diverse', sporty: false }
    ]);
});

test('bulkParse: getrennte Gender- und Sport-Tags ("Max m (s)")', () => {
    const { out } = collect('Max m (s)\nAnna w (s)\nTim m s\nEva (m) (s)\nBen s m');
    assert.deepEqual(out, [
        { name: 'Max', gender: 'male', sporty: true },
        { name: 'Anna', gender: 'female', sporty: true },
        { name: 'Tim', gender: 'male', sporty: true },
        { name: 'Eva', gender: 'male', sporty: true },
        { name: 'Ben', gender: 'male', sporty: true }
    ]);
});

test('bulkParse: doppelter Gender-Tag — zweites Token bleibt Namensbestandteil', () => {
    const { out } = collect('Anna w w');
    assert.deepEqual(out, [{ name: 'Anna w', gender: 'female', sporty: false }]);
});

test('bulkParse: Initial vor Tag bleibt erhalten ("Anna M w")', () => {
    const { out } = collect('Anna M w\nMia S s');
    assert.deepEqual(out, [
        { name: 'Anna M', gender: 'female', sporty: false },
        { name: 'Mia S', gender: 'female', sporty: true }
    ]);
});

test('bulkParse: zählt Duplikate als übersprungen', () => {
    const seen = new Set();
    const res = TG.bulkParse('Anna w, Anna w, Max m', name => {
        if (seen.has(name)) return false;
        seen.add(name); return true;
    });
    assert.equal(res.added, 2);
    assert.equal(res.skipped, 1);
});

test('bulkParse: Klassenkürzel in eckigen Klammern', () => {
    const out = [];
    TG.bulkParse('Max m s [7a]\nAnna w [7b]\nKim d\nLea [8c]', (name, gender, sporty, classTag) => { out.push({ name, gender, sporty, classTag }); return true; });
    assert.deepEqual(out, [
        { name: 'Max', gender: 'male', sporty: true, classTag: '7a' },
        { name: 'Anna', gender: 'female', sporty: false, classTag: '7b' },
        { name: 'Kim', gender: 'diverse', sporty: false, classTag: '' },
        { name: 'Lea', gender: 'female', sporty: false, classTag: '8c' }
    ]);
});

// --- Hobbys ---
test('parseHobbies: trennt, trimmt, dedupliziert (case-insensitiv) und begrenzt', () => {
    assert.deepEqual(TG.parseHobbies('Fussball, Tennis'), ['Fussball', 'Tennis']);
    assert.deepEqual(TG.parseHobbies('Fussball/Tennis; fussball'), ['Fussball', 'Tennis']);
    assert.deepEqual(TG.parseHobbies('  '), []);
    assert.deepEqual(TG.parseHobbies(''), []);
    assert.equal(TG.parseHobbies('x'.repeat(50))[0].length, 30);
});

test('sanitizeHobbies: verwirft Nicht-Strings und Nicht-Arrays', () => {
    assert.deepEqual(TG.sanitizeHobbies(['Fussball', 42, '', ' Tennis ']), ['Fussball', 'Tennis']);
    assert.deepEqual(TG.sanitizeHobbies('Fussball'), []);
    assert.deepEqual(TG.sanitizeHobbies(undefined), []);
});

// --- sanitizeStatus ---
test('sanitizeStatus: nur present/absent/injured, sonst present', () => {
    assert.equal(TG.sanitizeStatus('present'), 'present');
    assert.equal(TG.sanitizeStatus('absent'), 'absent');
    assert.equal(TG.sanitizeStatus('injured'), 'injured');
    assert.equal(TG.sanitizeStatus('kaputt'), 'present');
    assert.equal(TG.sanitizeStatus(undefined), 'present');
});

// --- pointsToGrade ---
test('pointsToGrade: Schweizer Formel, Rundung und Grenzen', () => {
    assert.equal(TG.pointsToGrade(20, 20), 6);
    assert.equal(TG.pointsToGrade(0, 20), 1);
    assert.equal(TG.pointsToGrade(10, 20), 3.5);
    assert.equal(TG.pointsToGrade(14.5, 20), 4.6); // 4.625 → 4.6
    assert.equal(TG.pointsToGrade(25, 20), 6);     // über Max → gedeckelt
    assert.equal(TG.pointsToGrade(5, 0), null);
    assert.equal(TG.pointsToGrade('x', 20), null);
});

// --- parseCsvImport mit Kürzel-Spalte ---
test('parseCsvImport: fünfte Spalte wird als Klassenkürzel gelesen', () => {
    const rows = TG.parseCsvImport('Klasse;Name;Geschlecht;Sportlich;Kürzel\nGruppe A;Anna;w;s;7a\nGruppe A;Max;m;;');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].classTag, '7a');
    assert.equal(rows[1].classTag, '');
});

// --- validateBackup: Prüfungen ---
test('validateBackup: Prüfungen werden validiert und normalisiert', () => {
    const result = TG.validateBackup({
        classes: [{ id: 1, name: '7a', students: [{ id: 1, name: 'Anna', gender: 'female' }] }],
        exams: {
            '1': [
                { id: 1, title: 'LZK 1', date: '2026-03-01', mode: 'points', maxPoints: 20, results: { '1': 15, '2': -3 } },
                { id: 2, title: 'LZK 2', date: '2026-03-08', mode: 'grades', results: { '1': 4.5, '2': 9 } },
                { id: 3, title: '', date: '2026-03-15', mode: 'grades', results: {} },
                { id: 4, title: 'Ohne Max', date: '2026-03-22', mode: 'points', results: {} }
            ],
            '99': [{ id: 5, title: 'Verwaist', date: '2026-01-01', mode: 'grades', results: {} }]
        },
        examIdCounter: 2
    });
    assert.ok(result);
    assert.equal(result.exams['1'].length, 2);
    assert.deepEqual(result.exams['1'][0].results, { '1': 15 });      // negative Punkte verworfen
    assert.deepEqual(result.exams['1'][1].results, { '1': 4.5 });     // Note 9 verworfen
    assert.equal(result.exams['99'], undefined);                       // verwaiste Klasse verworfen
    assert.equal(result.examIdCounter, 3);                             // Zähler wächst über höchste gültige ID
});

test('validateBackup: injured-Status bleibt erhalten, unbekannter Status wird present', () => {
    const b = validBackup();
    b.attendanceData['1']['2026-06-29'].records['1'].status = 'injured';
    b.attendanceData['1']['2026-06-29'].records['1'].note = 'Knie';
    b.attendanceData['1']['2026-06-29'].records['2'].status = 'kaputt';
    const res = TG.validateBackup(b);
    assert.equal(res.attendanceData['1']['2026-06-29'].records['1'].status, 'injured');
    assert.equal(res.attendanceData['1']['2026-06-29'].records['1'].note, 'Knie');
    assert.equal(res.attendanceData['1']['2026-06-29'].records['2'].status, 'present');
});

test('validateBackup: Schnuppern ist gültige Grund-Kategorie', () => {
    const b = validBackup();
    b.attendanceData['1']['2026-06-29'].records['2'].reasonCategory = 'Schnuppern';
    const res = TG.validateBackup(b);
    assert.equal(res.attendanceData['1']['2026-06-29'].records['2'].reasonCategory, 'Schnuppern');
});

test('validateBackup: hobbies der Schüler bleiben erhalten und werden bereinigt', () => {
    const result = TG.validateBackup({
        classes: [{ id: 1, name: 'G', students: [
            { id: 1, name: 'Anna', gender: 'female', hobbies: ['Fussball', ' Tennis ', 42, ''] },
            { id: 2, name: 'Max', gender: 'male', hobbies: 'kein-array' }
        ] }]
    });
    assert.deepEqual(result.classes[0].students[0].hobbies, ['Fussball', 'Tennis']);
    assert.deepEqual(result.classes[0].students[1].hobbies, []);
});

// --- parseCsvImport: Hobby-Spalte ---
test('parseCsvImport: sechste Spalte wird als Hobbys gelesen ("/"-getrennt)', () => {
    const rows = TG.parseCsvImport('Klasse;Name;Geschlecht;Sportlich;Kürzel;Hobbys\nGruppe A;Anna;w;s;7a;Fussball/Tennis\nGruppe A;Max;m;;;');
    assert.deepEqual(rows[0].hobbies, ['Fussball', 'Tennis']);
    assert.deepEqual(rows[1].hobbies, []);
});

test('validateBackup: classTag der Schüler bleibt erhalten und wird begrenzt', () => {
    const result = TG.validateBackup({
        classes: [{ id: 1, name: 'G', students: [
            { id: 1, name: 'Anna', gender: 'female', classTag: '7a' },
            { id: 2, name: 'Max', gender: 'male', classTag: 'x'.repeat(50) }
        ] }]
    });
    assert.equal(result.classes[0].students[0].classTag, '7a');
    assert.equal(result.classes[0].students[1].classTag.length, 20);
});

// --- parseAttendanceCsv ---
test('parseAttendanceCsv: beide Datumsformate, Kopfzeile, Gründe und Notizen', () => {
    const { rows, invalid } = TG.parseAttendanceCsv(
        'Datum;Name;Status;Grund;Notiz\n' +
        '15.09.2025;Anna;anwesend;;\n' +
        '2025-09-15;Max;abwesend;Krank;Grippe\n' +
        '22.09.2025;Anna;abwesend;verletzt;\n' +
        '22.09.2025;Kim;abwesend;Zahnarzt;\n' +
        'kein-datum;Ben;anwesend;;'
    );
    assert.equal(invalid.length, 1);
    assert.deepEqual(rows, [
        { date: '2025-09-15', name: 'Anna', status: 'present', reasonCategory: '', note: '' },
        { date: '2025-09-15', name: 'Max', status: 'absent', reasonCategory: 'Krank', note: 'Grippe' },
        { date: '2025-09-22', name: 'Anna', status: 'absent', reasonCategory: 'Verletzt', note: '' },
        { date: '2025-09-22', name: 'Kim', status: 'absent', reasonCategory: '', note: 'Zahnarzt' }
    ]);
});

test('parseAttendanceCsv: Status-Synonyme und ungültiger Status', () => {
    const { rows, invalid } = TG.parseAttendanceCsv(
        '01.09.2025;Anna;x;;\n01.09.2025;Max;0;;\n01.09.2025;Kim;vielleicht;;'
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].status, 'present');
    assert.equal(rows[1].status, 'absent');
    assert.equal(invalid.length, 1);
});

test('parseAttendanceCsv: Status "verletzt" = anwesend, macht nicht mit', () => {
    const { rows } = TG.parseAttendanceCsv(
        '01.09.2025;Anna;verletzt;;Fuss verstaucht\n01.09.2025;Max;injured;;'
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].status, 'injured');
    assert.equal(rows[0].note, 'Fuss verstaucht');
    assert.equal(rows[1].status, 'injured');
});

test('parseAttendanceCsv: Schnuppern wird als Grund erkannt', () => {
    const { rows } = TG.parseAttendanceCsv('01.09.2025;Anna;abwesend;Schnuppern;');
    assert.equal(rows[0].reasonCategory, 'Schnuppern');
});

// --- parseCsvImport ---
test('parseCsvImport: Kopfzeile wird übersprungen', () => {
    const rows = TG.parseCsvImport('Klasse;Name;Geschlecht;Sportlich\n7a;Anna;w;s\n7a;Max;m;');
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { className: '7a', studentName: 'Anna', gender: 'female', sporty: true, classTag: '', hobbies: [] });
    assert.deepEqual(rows[1], { className: '7a', studentName: 'Max', gender: 'male', sporty: false, classTag: '', hobbies: [] });
});

test('parseCsvImport: ohne Kopfzeile bleibt alles erhalten', () => {
    const rows = TG.parseCsvImport('7a;Anna;w\n7b;Kim;d;ja');
    assert.equal(rows.length, 2);
    assert.equal(rows[1].gender, 'diverse');
    assert.equal(rows[1].sporty, true);
});

test('parseCsvImport: Komma als Trennzeichen und leere Zeilen', () => {
    const rows = TG.parseCsvImport('\n7a,Anna,w\n\n7a,Max,m,x\n');
    assert.equal(rows.length, 2);
    assert.equal(rows[1].sporty, true);
});

// --- escapeCsv (Formel-Injection) ---
test('escapeCsv neutralisiert Formeln und escapt Anführungszeichen', () => {
    assert.equal(TG.escapeCsv('=SUM(A1)'), '"\'=SUM(A1)"');
    assert.equal(TG.escapeCsv('+41 79'), '"\'+41 79"');
    assert.equal(TG.escapeCsv('@cmd'), '"\'@cmd"');
    assert.equal(TG.escapeCsv('Anna "A"'), '"Anna ""A"""');
    assert.equal(TG.escapeCsv('normal'), '"normal"');
});

// --- distributeTeams ---
function makePersons(n, opts = {}) {
    return Array.from({ length: n }, (_, i) => ({
        id: i + 1, name: `P${i + 1}`,
        gender: opts.genders ? opts.genders[i % opts.genders.length] : 'female',
        sporty: opts.sporty ? opts.sporty[i % opts.sporty.length] : false
    }));
}

test('distributeTeams: Teamgrössen unterscheiden sich höchstens um 1', () => {
    for (const [count, n] of [[10, 3], [7, 2], [9, 4], [20, 6]]) {
        const teams = TG.distributeTeams(makePersons(count), n, {});
        assert.equal(teams.length, n);
        const sizes = teams.map(t => t.length);
        assert.equal(sizes.reduce((a, b) => a + b, 0), count);
        assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
    }
});

test('distributeTeams: Geschlechter-Balance ±1 pro Team', () => {
    const persons = makePersons(12, { genders: ['female', 'male'] }); // 6 w, 6 m
    const teams = TG.distributeTeams(persons, 3, { balanceGender: true });
    teams.forEach(team => {
        const f = team.filter(p => p.gender === 'female').length;
        const m = team.filter(p => p.gender === 'male').length;
        assert.ok(Math.abs(f - m) <= 1, `unausgewogen: ${f}w/${m}m`);
    });
});

test('distributeTeams: Sportlichkeits-Balance ±1 pro Team', () => {
    const persons = makePersons(12, { sporty: [true, false] });
    const teams = TG.distributeTeams(persons, 4, { balanceSport: true });
    const sportyCounts = teams.map(t => t.filter(p => p.sporty).length);
    assert.ok(Math.max(...sportyCounts) - Math.min(...sportyCounts) <= 1);
});

test('distributeTeams: sportLevelOf verteilt jede Stufe ±1 pro Team', () => {
    // 4 Fussballer (Stufe 2), 4 sportliche (Stufe 1), 4 übrige (Stufe 0) auf 4 Teams
    const persons = Array.from({ length: 12 }, (_, i) => ({
        id: i + 1, name: `P${i + 1}`, gender: 'female',
        sporty: i % 3 === 1,
        hobbies: i % 3 === 0 ? ['Fussball'] : []
    }));
    const levelOf = p => (p.hobbies || []).includes('Fussball') ? 2 : (p.sporty ? 1 : 0);
    const teams = TG.distributeTeams(persons, 4, { balanceSport: true, sportLevelOf: levelOf });
    [2, 1, 0].forEach(level => {
        const counts = teams.map(t => t.filter(p => levelOf(p) === level).length);
        assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `Stufe ${level} unausgewogen: ${counts}`);
    });
    const all = teams.flat().map(p => p.id).sort((a, b) => a - b);
    assert.deepEqual(all, persons.map(p => p.id));
});

test('distributeTeams: niemand geht verloren oder wird dupliziert', () => {
    const persons = makePersons(11, { genders: ['female', 'male', 'diverse'], sporty: [true, false, false] });
    const teams = TG.distributeTeams(persons, 3, { balanceGender: true, balanceSport: true });
    const all = teams.flat().map(p => p.id).sort((a, b) => a - b);
    assert.deepEqual(all, persons.map(p => p.id));
});

// --- enforceApart ---
test('enforceApart: trennt ein Konfliktpaar', () => {
    const teams = [
        [{ name: 'Anna', gender: 'female' }, { name: 'Max', gender: 'male' }],
        [{ name: 'Kim', gender: 'female' }, { name: 'Lea', gender: 'female' }]
    ];
    const { teams: fixed, unresolved } = TG.enforceApart(teams, [['Anna', 'Max']]);
    assert.equal(unresolved, false);
    fixed.forEach(team => {
        const names = team.map(p => p.name.toLowerCase());
        assert.ok(!(names.includes('anna') && names.includes('max')));
    });
});

test('enforceApart: Namensvergleich case-insensitiv', () => {
    const teams = [
        [{ name: 'anna' }, { name: 'MAX' }],
        [{ name: 'Kim' }]
    ];
    const { unresolved } = TG.enforceApart(teams, [['Anna', 'max']]);
    assert.equal(unresolved, false);
});

test('enforceApart: meldet unlösbare Konstellation', () => {
    // 3 Personen, die sich alle paarweise ausschliessen, aber nur 2 Teams
    const teams = [
        [{ name: 'A' }, { name: 'B' }],
        [{ name: 'C' }]
    ];
    const { unresolved } = TG.enforceApart(teams, [['A', 'B'], ['A', 'C'], ['B', 'C']]);
    assert.equal(unresolved, true);
});

test('enforceApart: keine Regeln → unverändert', () => {
    const teams = [[{ name: 'A' }], [{ name: 'B' }]];
    const res = TG.enforceApart(teams, []);
    assert.equal(res.unresolved, false);
    assert.deepEqual(res.teams, teams);
});

// --- validateBackup ---
const validBackup = () => ({
    version: 2,
    exportedAt: '2026-07-01T10:00:00.000Z',
    classes: [{
        id: 1, name: '7a',
        students: [{ id: 1, name: 'Anna', gender: 'female', sporty: true }],
        formerStudents: [{ id: 2, name: 'Max', gender: 'male', sporty: false }],
        schedule: [{ weekday: 0, time: '10:00' }]
    }],
    classIdCounter: 2, stuIdCounter: 3,
    attendanceData: {
        '1': { '2026-06-29': { date: '2026-06-29', weekday: 0, records: { '1': { status: 'present', reasonCategory: '', note: '' }, '2': { status: 'absent', reasonCategory: 'Krank', note: 'Grippe' } } } }
    },
    persons: [{ id: 5, name: 'Gast', gender: 'diverse', sporty: false }],
    personIdCounter: 6,
    apartPairs: [['Anna', 'Max']]
});

test('validateBackup: gültiges Backup inkl. persons und formerStudents', () => {
    const res = TG.validateBackup(validBackup());
    assert.ok(res);
    assert.equal(res.classes.length, 1);
    assert.equal(res.classes[0].formerStudents.length, 1);
    assert.equal(res.persons.length, 1);
    assert.equal(res.personIdCounter, 6);
    assert.equal(res.attendanceData['1']['2026-06-29'].records['2'].reasonCategory, 'Krank');
});

test('validateBackup: Version-1-Backup ohne persons bleibt gültig', () => {
    const b = validBackup();
    delete b.persons; delete b.personIdCounter; delete b.apartPairs;
    b.classes[0] = { id: 1, name: '7a', students: b.classes[0].students, schedule: [] };
    const res = TG.validateBackup(b);
    assert.ok(res);
    assert.deepEqual(res.persons, []);
    assert.deepEqual(res.apartPairs, []);
    assert.deepEqual(res.classes[0].formerStudents, []);
});

test('validateBackup: apartPairs werden übernommen und bereinigt', () => {
    const b = validBackup();
    b.apartPairs = [['Anna', 'Max'], ['nur-einer'], [1, 2], ['', 'Leer'], ['Kim', 'Lea']];
    const res = TG.validateBackup(b);
    assert.deepEqual(res.apartPairs, [['Anna', 'Max'], ['Kim', 'Lea']]);
});

test('validateBackup: lehnt kaputte Strukturen ab', () => {
    assert.equal(TG.validateBackup(null), null);
    assert.equal(TG.validateBackup({}), null);
    assert.equal(TG.validateBackup({ classes: [{ name: '' }] }), null);
    assert.equal(TG.validateBackup({ classes: [{ id: 1 }] }), null);
});

test('validateBackup: normalisiert ungültige Werte statt sie zu übernehmen', () => {
    const b = validBackup();
    b.classes[0].students.push({ id: 9, name: 'Evil', gender: '<script>', sporty: 'yes' });
    b.classes[0].schedule.push({ weekday: 9, time: '99:99' });
    b.attendanceData['1']['not-a-date'] = { records: {} };
    b.attendanceData['1']['2026-06-29'].records['1'].reasonCategory = 'Erfunden';
    const res = TG.validateBackup(b);
    const evil = res.classes[0].students.find(s => s.name === 'Evil');
    assert.equal(evil.gender, 'diverse');
    assert.equal(evil.sporty, false);
    assert.equal(res.classes[0].schedule.length, 1);
    assert.equal(res.attendanceData['1']['not-a-date'], undefined);
    assert.equal(res.attendanceData['1']['2026-06-29'].records['1'].reasonCategory, '');
});

test('validateBackup: Attendance verwaister Klassen wird verworfen, Zähler wachsen mit', () => {
    const b = validBackup();
    b.attendanceData['99'] = b.attendanceData['1'];
    b.stuIdCounter = 1; // zu klein — muss auf maxId+1 angehoben werden
    const res = TG.validateBackup(b);
    assert.equal(res.attendanceData['99'], undefined);
    assert.ok(res.stuIdCounter >= 3);
});

// --- computePointsTotal ---
test('computePointsTotal: summiert Lektionen und respektiert Resets', () => {
    assert.equal(TG.computePointsTotal([]), 0);
    assert.equal(TG.computePointsTotal([
        { type: 'lektion', points: 7 },
        { type: 'lektion', points: 5 }
    ]), 12);
    assert.equal(TG.computePointsTotal([
        { type: 'lektion', points: 7 },
        { type: 'reset' },
        { type: 'lektion', points: 5 },
        { type: 'lektion', points: 3 }
    ]), 8);
    // ungültige Punktwerte zählen nicht
    assert.equal(TG.computePointsTotal([{ type: 'lektion', points: -4 }, { type: 'lektion', points: 'x' }]), 0);
});

// --- validateBackup: Klassenpunkte ---
test('validateBackup: pointsData wird validiert, collectsPoints bleibt erhalten', () => {
    const result = TG.validateBackup({
        classes: [{ id: 1, name: '7a', collectsPoints: true, students: [] }],
        pointsData: {
            '1': {
                goals: [
                    { id: 1, text: 'Fairplay', points: 2 },
                    { id: 2, text: '', points: 1 },
                    { id: 3, text: 'Start', points: 99 }
                ],
                entries: [
                    { id: 4, type: 'lektion', date: '2026-09-07', goalIds: [1], note: 'gut', points: 2 },
                    { id: 5, type: 'reset', date: '2026-09-14' },
                    { id: 6, type: 'lektion', date: 'kein-datum', goalIds: [], note: '', points: 1 }
                ]
            },
            '99': { goals: [], entries: [] }
        },
        pointsIdCounter: 2
    });
    assert.ok(result);
    assert.equal(result.classes[0].collectsPoints, true);
    assert.equal(result.pointsData['1'].goals.length, 2);          // leerer Text verworfen
    assert.equal(result.pointsData['1'].goals[1].points, 1);       // 99 → normalisiert auf 1
    assert.equal(result.pointsData['1'].entries.length, 2);        // ungültiges Datum verworfen
    assert.equal(result.pointsData['1'].entries[1].type, 'reset');
    assert.equal(result.pointsData['99'], undefined);              // verwaiste Klasse verworfen
    assert.equal(result.pointsIdCounter, 6);                       // wächst über höchste gültige ID
});

// --- computePointsSeries / Anpassungen ---
test('computePointsSeries: Anpassungen (auch negativ) und Klammerung bei 0', () => {
    const series = TG.computePointsSeries([
        { id: 1, type: 'adjust', date: '2026-09-01', points: 30 },   // Startpunktestand
        { id: 2, type: 'lektion', date: '2026-09-07', points: 5 },
        { id: 3, type: 'adjust', date: '2026-09-08', points: -50 },  // fällt nicht unter 0
        { id: 4, type: 'lektion', date: '2026-09-14', points: 7 }
    ]);
    assert.deepEqual(series.map(s => s.total), [30, 35, 0, 7]);
    assert.equal(TG.computePointsTotal([
        { type: 'adjust', points: 30 },
        { type: 'lektion', points: 5 },
        { type: 'reset' },
        { type: 'lektion', points: 3 }
    ]), 3);
});

test('validateBackup: adjust-Einträge bleiben erhalten (inkl. negativer Punkte)', () => {
    const result = TG.validateBackup({
        classes: [{ id: 1, name: '7a', students: [] }],
        pointsData: { '1': { goals: [], entries: [
            { id: 1, type: 'adjust', date: '2026-09-01', points: 30, note: 'Übertrag' },
            { id: 2, type: 'adjust', date: '2026-09-02', points: -5 },
            { id: 3, type: 'adjust', date: '2026-09-03', points: 99999 }
        ] } }
    });
    const entries = result.pointsData['1'].entries;
    assert.equal(entries.length, 3);
    assert.equal(entries[0].points, 30);
    assert.equal(entries[0].note, 'Übertrag');
    assert.equal(entries[1].points, -5);
    assert.equal(entries[2].points, 9999); // auf Bereich begrenzt
});

// --- distributeTeams: kein Positions-Bias ---
test('distributeTeams: der Überschuss landet nicht immer in Team 1', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ name: 'P' + i, gender: 'female', sporty: i < 5 }));
    const bigAt = [0, 0, 0];
    const runs = 600;
    for (let r = 0; r < runs; r++) {
        TG.distributeTeams(ten, 3, { balanceGender: true, balanceSport: true }).forEach((t, i) => { if (t.length === 4) bigAt[i]++; });
    }
    // jede Position sollte ungefähr 1/3 der Läufe das grössere Team sein (erwartet ~200)
    bigAt.forEach(n => assert.ok(n > 120 && n < 280, `Verteilung unausgewogen: ${bigAt}`));
});

// ---------- Sitzordnung ----------
const { generateSeating, cleanSeatingPlan, validateBackup } = TG;
const seatGrid = (c, r) => { const d = []; for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) d.push({ x, y, s: null, l: false }); return d; };

test('generateSeating: alle Schüler genau einmal platziert', () => {
    const studs = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, gender: i % 2 ? 'male' : 'female' }));
    const res = generateSeating(seatGrid(4, 4), studs, {});
    assert.equal(res.ok, true);
    const ids = res.desks.filter(d => d.s !== null).map(d => d.s).sort((a, b) => a - b);
    assert.deepEqual(ids, studs.map(s => s.id));
});

test('generateSeating: zu wenige Tische -> ok=false mit unplaced', () => {
    const studs = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, gender: 'male' }));
    const res = generateSeating(seatGrid(2, 2), studs, {});
    assert.equal(res.ok, false);
    assert.equal(res.unplaced, 1);
});

test('generateSeating: fixierte Tische bleiben unverändert', () => {
    const desks = seatGrid(3, 2);
    desks[0].s = 7; desks[0].l = true;
    const studs = [1, 2, 3, 7].map(id => ({ id, gender: 'male' }));
    for (let i = 0; i < 20; i++) {
        const res = generateSeating(desks, studs, {});
        assert.equal(res.desks[0].s, 7);
        assert.equal(res.desks.filter(d => d.s === 7).length, 1);
    }
});

test('generateSeating: Geschlechter werden gemischt, wenn möglich', () => {
    const studs = [1, 2, 3, 4].map(id => ({ id, gender: 'female' })).concat([5, 6, 7, 8].map(id => ({ id, gender: 'male' })));
    const res = generateSeating(seatGrid(8, 1), studs, { mixGender: true });
    assert.equal(res.penalty, 0);
});

test('generateSeating: "nicht zusammen" liegt nicht nebeneinander', () => {
    const studs = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, gender: 'male' }));
    for (let i = 0; i < 20; i++) {
        const res = generateSeating(seatGrid(3, 3), studs, { apart: [[1, 2]] });
        const a = res.desks.find(d => d.s === 1), b = res.desks.find(d => d.s === 2);
        assert.ok(Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1);
    }
});

test('cleanSeatingPlan: verwirft ungültige/doppelte Tische und unbekannte Schüler', () => {
    const plan = cleanSeatingPlan({ cols: 4, rows: 3, desks: [
        { x: 0, y: 0, s: 1, l: true }, { x: 0, y: 0, s: 2 }, { x: 9, y: 0, s: 3 },
        { x: 1, y: 0, s: 99 }, { x: 2, y: 0, s: 1 }, { x: 'a', y: 0 }
    ] }, new Set([1, 2, 3]));
    assert.equal(plan.desks.length, 3);
    assert.equal(plan.desks[1].s, null);
    assert.equal(plan.desks[2].s, null);
});

test('validateBackup: seatingData wird bereinigt übernommen', () => {
    const r = validateBackup({ classes: [{ id: 1, name: 'A', students: [{ id: 1, name: 'Max', gender: 'male' }] }],
        seatingData: { 1: { current: { cols: 4, rows: 3, desks: [{ x: 0, y: 0, s: 1 }] }, saved: [{ id: 5, name: 'Plan', cols: 4, rows: 3, desks: [] }] }, 7: { current: null, saved: [] } } });
    assert.equal(r.seatingData[1].saved.length, 1);
    assert.equal(r.seatingIdCounter, 6);
    assert.equal(r.seatingData[7], undefined);
});

test('validateBackup: Tischanordnungen (layouts) werden ohne Personen übernommen', () => {
    const r = validateBackup({ classes: [{ id: 1, name: 'A', students: [{ id: 1, name: 'Max', gender: 'male' }] }],
        seatingData: { 1: { current: null, saved: [], layouts: [{ id: 3, name: 'Zimmer', cols: 4, rows: 3, desks: [{ x: 0, y: 0, s: 1, l: true }, { x: 1, y: 0 }] }] } } });
    assert.equal(r.seatingData[1].layouts.length, 1);
    assert.equal(r.seatingData[1].layouts[0].desks[0].s, null);
    assert.equal(r.seatingIdCounter, 4);
});

test('validateBackup: Klassenart (kind) wird übernommen, Standard ist both', () => {
    const r = validateBackup({ classes: [{ id: 1, name: 'A', kind: 'sport' }, { id: 2, name: 'B' }, { id: 3, name: 'C', kind: 'x' }, { id: 4, name: 'D', kind: 'room' }] });
    assert.deepEqual(r.classes.map(c => c.kind), ['sport', 'both', 'both', 'room']);
});

test('validateBackup ist idempotent (Datendatei-Abgleich vergleicht normalisierte Stände)', () => {
    const raw = { classes: [{ id: 1, name: 'A', students: [{ id: 1, name: 'Max', gender: 'male' }, { id: 2, name: 'Eva', gender: 'female', sporty: true }] }],
        exams: { 1: [{ id: 1, title: 'T', date: '2026-01-05', mode: 'grades', results: { 1: 5 } }] },
        pointsData: { 1: { goals: [{ id: 1, text: 'Z', points: 2 }], entries: [] } },
        seatingData: { 1: { current: { cols: 4, rows: 3, desks: [{ x: 0, y: 0, s: 1, l: true }] }, saved: [], layouts: [] } } };
    const once = validateBackup(raw);
    const twice = validateBackup(JSON.parse(JSON.stringify(once)));
    const pick = r => JSON.stringify([r.classes, r.attendanceData, r.persons, r.apartPairs, r.exams, r.pointsData, r.seatingData]);
    assert.equal(pick(once), pick(twice));
});
