// UIManager.js - Visual Feedback & Display
// Manages all on-screen text and UI state.

//@input Component.Text scoreText {"label": "Score Text"}
//@input Component.Text ratingText {"label": "Rating Flash Text"}
//@input Component.Text promptText {"label": "Prompt/Countdown Text"}
//@input Component.Text comboText {"label": "Combo Text"}

var ratingTimer = 0;
var RATING_DISPLAY_TIME = 0.8;

// ============================================================
// STATE DISPLAY
// ============================================================
script.showIdle = function () {
    setPrompt("Tap to Dance!");
    setScore("");
    setRating("");
    setCombo("");
};

script.showCountdown = function (num) {
    setPrompt("" + num);
    setScore("");
    setRating("");
    setCombo("");
};

script.showDancing = function () {
    setPrompt("");
    setScore("0");
    setCombo("");
};

script.showResults = function (finalScore) {
    var stars = getStarRating(finalScore);
    setPrompt(stars + "\nScore: " + finalScore + "\n\nTap to Retry");
    setScore("");
    setRating("");
    setCombo("");
};

// ============================================================
// LIVE UPDATES
// ============================================================
script.showRating = function (rating) {
    setRating(rating);
    ratingTimer = RATING_DISPLAY_TIME;
};

script.updateScore = function (score) {
    setScore("" + score);
};

script.updateCombo = function (combo) {
    if (combo >= 2) {
        setCombo(combo + "x Combo!");
    } else {
        setCombo("");
    }
};

script.updateProgress = function (fraction) {
    // Could update a progress bar here; for MVP we skip it
};

// ============================================================
// HELPERS
// ============================================================
function setPrompt(txt) {
    if (script.promptText) script.promptText.text = txt;
}

function setScore(txt) {
    if (script.scoreText) script.scoreText.text = txt;
}

function setRating(txt) {
    if (script.ratingText) script.ratingText.text = txt;
}

function setCombo(txt) {
    if (script.comboText) script.comboText.text = txt;
}

function getStarRating(score) {
    if (score >= 1800) return "* * * * *";
    if (score >= 1400) return "* * * *";
    if (score >= 1000) return "* * *";
    if (score >= 600) return "* *";
    return "*";
}

// Fade out rating text after display time
var updateEvent = script.createEvent("UpdateEvent");
updateEvent.bind(function (eventData) {
    if (ratingTimer > 0) {
        ratingTimer -= eventData.getDeltaTime();
        if (ratingTimer <= 0) {
            setRating("");
        }
    }
});
