/* Google Translate, loaded on demand.
   The ~100 KB translate engine only downloads when a visitor opens the language
   menu, or when they already chose a language on a previous page (googtrans cookie).
   This keeps it off the critical path for everyone else. */
(function () {
    var loading = null;

    window.googleTranslateElementInit = function () {
        new google.translate.TranslateElement({
            pageLanguage: 'en',
            includedLanguages: 'en,fr,es,de,pt,it,ar,zh-CN,ja,ko,ak,gaa,ig',
            autoDisplay: false
        }, 'google_translate_element');
    };

    // Resolves with the hidden Google <select> once it is ready.
    window.mansoraLoadTranslate = function () {
        if (loading) return loading;
        loading = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
            s.async = true;
            s.onerror = reject;
            document.head.appendChild(s);
            var tries = 0;
            (function wait() {
                var combo = document.querySelector('.goog-te-combo');
                if (combo && combo.options.length > 1) return resolve(combo);
                if (++tries > 150) return reject(new Error('Google Translate did not load'));
                setTimeout(wait, 100);
            })();
        });
        return loading;
    };

    function start() {
        // Keep the visitor's chosen language as they move between pages.
        if (/(?:^|;\s*)googtrans=\/[^/]+\/(?!en\b)[^;]+/.test(document.cookie)) window.mansoraLoadTranslate();
        // Warm the engine up as soon as the language menu is opened.
        var toggle = document.getElementById('languageToggle');
        if (toggle) toggle.addEventListener('click', function () { window.mansoraLoadTranslate(); }, { once: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
