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
    setPrompt("Tap to Upload");
    setScore("");
    setRating("");
    setCombo("");
};

script.showWaiting = function () {
    setPrompt("Loading...");
    setScore("");
    setRating("");
    setCombo("");
};

script.showVideoLoading = function () {
    setPrompt("Select a video...");
    setScore("");
    setRating("");
    setCombo("");
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
};

script.showDancing = function () {
    setPrompt("");
    setScore("0");
    setCombo("");
};

script.showResults = function (finalScore, checkpointCount) {
    var stars = getStarRating(finalScore, checkpointCount);
    setPrompt(stars + "\n" + finalScore + "\n\nTap to Retry");
    setScore("");
    setRating("");
    setCombo("");
};

script.showResultsWithShare = function (finalScore, checkpointCount) {
    var stars = getStarRating(finalScore, checkpointCount);
    setPrompt(stars + "\n" + finalScore + "\nTap to continue");
    setScore("");
    setRating("");
    setCombo("");
};

script.showChallengePrompt = function (opponentScore) {
    setPrompt("Beat " + opponentScore + "!");
    setScore("");
    setRating("");
    setCombo("");
};

script.showSharePrompt = function () {
    setPrompt("Tap to challenge\na friend!");
    setScore("");
    setRating("");
    setCombo("");
};

script.showChallengeUpload = function () {
    setPrompt("Upload the\nsame video!");
    setScore("");
    setRating("");
    setCombo("");
};

script.showWrongVideo = function () {
    setPrompt("Wrong video!\nTry again");
    setScore("");
    setRating("");
    setCombo("");
};

script.showMultiplayerResults = function (myScore, theirScore, iWon) {
    var result = iWon ? "YOU WIN!" : (myScore === theirScore ? "TIE!" : "YOU LOSE!");
    setPrompt(result + "\nYou: " + myScore + "\nThem: " + theirScore);
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
    // Combo is shown in the HeadScore popup, not in the top-left corner
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

function getStarRating(score, checkpointCount) {
    var n = checkpointCount || 10;
    var max = 300 * n;
    if (score >= max * 0.8) return "\u2B50\u2B50\u2B50\u2B50\u2B50";
    if (score >= max * 0.6) return "\u2B50\u2B50\u2B50\u2B50";
    if (score >= max * 0.4) return "\u2B50\u2B50\u2B50";
    if (score >= max * 0.2) return "\u2B50\u2B50";
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
