// UIManager.js - Visual Feedback & Display
// Manages all on-screen text and UI state.

//@input Component.Text scoreText {"label": "Score Text"}
//@input Component.Text ratingText {"label": "Rating Flash Text"}
//@input Component.Text promptText {"label": "Prompt/Countdown Text"}
//@input Component.Text comboText {"label": "Combo Text"}
//@input Component.ScriptComponent creditsManager {"label": "Credits Manager"}

var ratingTimer = 0;
var RATING_DISPLAY_TIME = 0.8;

// ============================================================
// STATE DISPLAY
// ============================================================
script.showIdle = function () {
    setPrompt("Upload your own dance\n\nOr try one of these");
    setScore("");
    setRating("");
    setCombo("");
    hideCreditsButton();
};

script.showWaiting = function () {
    setPrompt("Loading...");
    setScore("");
    setRating("");
    setCombo("");
    hideCreditsButton();
};

script.showVideoLoading = function () {
    setPrompt("Select a video...");
    setScore("");
    setRating("");
    setCombo("");
    hideCreditsButton();
};

script.showRecordingProgress = function (progress) {
    var pct = Math.floor(progress * 100);
    setPrompt("Loading " + pct + "%");
};

script.showCountdown = function (num) {
    setPrompt("" + num);
    setScore("");
    setRating("");
    setCombo("");
    hideCreditsButton();
};

script.showDancing = function () {
    setPrompt("");
    setScore("0");
    setCombo("");
    hideCreditsButton();
};

script.showResults = function (finalScore, checkpointCount) {
    var stars = getStarRating(finalScore, checkpointCount);
    setPrompt(stars + "\n" + finalScore + "\n\nTap to Retry");
    setScore("");
    setRating("");
    setCombo("");
    hideCreditsButton();
};

script.showResultsWithShare = function (finalScore, checkpointCount) {
    var stars = getStarRating(finalScore, checkpointCount);
    setPrompt(stars + "\n" + finalScore + "\nTap to continue");
    setScore("");
    setRating("");
    setCombo("");
    hideCreditsButton();
};

script.showChallengePrompt = function (opponentScore) {
    setPrompt("Beat " + opponentScore + "!");
    setScore("");
    setRating("");
    setCombo("");
    hideCreditsButton();
};

script.showSharePrompt = function () {
    setPrompt("Tap to challenge\na friend!");
    setScore("");
    setRating("");
    setCombo("");
    showCreditsButton();
};

script.showChallengeUpload = function () {
    setPrompt("Upload the\nsame video!");
    setScore("");
    setRating("");
    setCombo("");
    hideCreditsButton();
};

script.showWrongVideo = function () {
    setPrompt("Wrong video!\nTry again");
    setScore("");
    setRating("");
    setCombo("");
    hideCreditsButton();
};

script.showMultiplayerResults = function (myScore, theirScore, iWon) {
    var result = iWon ? "YOU WIN!" : (myScore === theirScore ? "TIE!" : "YOU LOSE!");
    setPrompt(result + "\nYou: " + myScore + "\nThem: " + theirScore);
    setScore("");
    setRating("");
    setCombo("");
    hideCreditsButton();
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
    // Combo is shown in the HeadScore popup, not in the top-left corner
};

script.updateProgress = function (fraction) {
    // Could update a progress bar here; for MVP we skip it
};

// ============================================================
// HELPERS
// ============================================================
function showCreditsButton() {
    if (script.creditsManager) script.creditsManager.showButton();
}

function hideCreditsButton() {
    if (script.creditsManager) script.creditsManager.hideButton();
}

script.isCreditsOpen = function () {
    return script.creditsManager && script.creditsManager.isCreditsOpen();
};

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

function getStarRating(score, checkpointCount) {
    var n = checkpointCount || 10;
    var comboFactor = 1.0 + 0.2 * (Math.min(n, 20) / 20);
    var max = 300 * n * comboFactor;
    if (score >= max * 0.55) return "\u2B50\u2B50\u2B50\u2B50\u2B50";
    if (score >= max * 0.40) return "\u2B50\u2B50\u2B50\u2B50";
    if (score >= max * 0.25) return "\u2B50\u2B50\u2B50";
    if (score >= max * 0.12) return "\u2B50\u2B50";
    return "\u2B50";
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
