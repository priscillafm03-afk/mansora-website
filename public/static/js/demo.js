/* Request a Software Demo (/request-demo).
   One submission id per form fill: a retry after a network error reuses it, so the platform never records the
   same request twice. Success is shown only when the platform has saved the request. */
(function () {
    "use strict";
    var form = document.getElementById("demoForm");
    if (!form) return;
    var idField = document.getElementById("demoSubmissionId");
    var status = document.getElementById("demoStatus");
    var button = document.getElementById("demoSubmit");
    var KEY = "mansora-demo-submission";

    function newId() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        var b = crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
        var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
        return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
    }
    function currentId() {
        var id = null;
        try { id = sessionStorage.getItem(KEY); } catch (e) { /* storage unavailable */ }
        if (!id) { id = newId(); try { sessionStorage.setItem(KEY, id); } catch (e) { /* storage unavailable */ } }
        return id;
    }
    function say(text, tone) {
        status.textContent = text;
        status.className = "form-status" + (tone ? " form-status-" + tone : "");
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }
        idField.value = currentId();
        button.disabled = true;
        say("Sending your request…");
        var result = null, ok = false;
        try {
            var response = await fetch("/demo", { method: "POST", body: new FormData(form), headers: { accept: "application/json" } });
            result = await response.json().catch(function () { return null; });
            ok = response.ok && result && result.ok;
        } catch (e) { result = null; }
        button.disabled = false;
        if (ok) {
            try { sessionStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
            form.reset();
            say("Thank you. Your demo request was received" + (result.reference && result.reference !== "received" ? " (reference " + result.reference + ")" : "") +
                ". A confirmation is on its way to your email, and the Mansora team will contact you to arrange a time.", "good");
            return;
        }
        if (result && result.fallback === "mailto") {
            say("Online requests are not available just now. Please email priscilla@mansora-consulting.com or call 024 420 5134.", "bad");
            return;
        }
        // Not saved: keep the details and the same submission id, so trying again cannot create a duplicate.
        say((result && result.error) || "We couldn't send your request. Check your connection and press the button again.", "bad");
    });
}());
