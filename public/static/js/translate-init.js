/* Google Translate bootstrap (moved out of inline <script> so the CSP can forbid inline scripts). */
window.googleTranslateElementInit = function () {
    new google.translate.TranslateElement({
        pageLanguage: 'en',
        includedLanguages: 'en,fr,es,de,pt,it,ar,zh-CN,ja,ko',
        autoDisplay: false
    }, 'google_translate_element');
};
