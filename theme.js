// Farbschema vor dem ersten Zeichnen setzen (verhindert kurzes Aufblitzen im falschen Schema).
// Gespeicherte Wahl gilt, sonst die Systemeinstellung.
(function () {
    try {
        var t = localStorage.getItem('tg2_theme');
        var dark = t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        if (dark) document.documentElement.classList.add('dark');
    } catch (e) {}
})();
