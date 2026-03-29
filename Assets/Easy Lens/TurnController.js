// TurnController.js - Turn-Based Multiplayer Bridge
// Connects the Turn-Based Component with the dance game.
// Player 1 dances, then challenges a friend.
// Player 2 receives the choreography, dances to beat the score.

//@input Component.ScriptComponent turnbased {"label": "Turn Based Component"}
//@input Component.ScriptComponent stateMachine
//@input Component.ScriptComponent choreographyManager
//@input Component.ScriptComponent scoringEngine
//@input Component.ScriptComponent uiManager

var isChallenge = false;       // true when this is a received challenge (turn >= 1)
var opponentScore = 0;         // challenger's score
var myTurnCount = -1;          // which turn this is
var currentUserIndex = -1;
var alreadyResolved = false;   // prevent double-resolution

// ============================================================
// PUBLIC API (called by StateMachine)
// ============================================================

script.isChallenge = function () {
    return isChallenge;
};

script.getOpponentScore = function () {
    return opponentScore;
};

// Called when user taps "Challenge Friend" on results screen
script.sendChallenge = function () {
    if (!script.turnbased) {
        print("TURN: No turnbased component!");
        return;
    }

    var finalScore = script.scoringEngine.getFinalScore();
    var danceData = script.choreographyManager.exportDance();

    if (!danceData) {
        print("TURN: No dance data to export!");
        return;
    }

    var challengeData = {
        score: finalScore,
        dance: danceData,
        videoDuration: script.choreographyManager.getDuration()
    };

    // Save as global variable (persists across turns)
    script.turnbased.setGlobalVariable("challengeData", JSON.stringify(challengeData));
    script.turnbased.setScore(finalScore);

    print("TURN: Challenge sent! Score=" + finalScore + ", poses=" + danceData.p.length);

    // End the turn — this captures the snap and sends it
    script.turnbased.endTurn();
};

// ============================================================
// CORE: Determine if this is a challenge or solo play
// ============================================================

function resolveMode() {
    if (alreadyResolved) return;
    alreadyResolved = true;
    checkTurnData();
}

async function checkTurnData() {
    try {
        myTurnCount = await script.turnbased.getTurnCount();
        currentUserIndex = await script.turnbased.getCurrentUserIndex();
        print("TURN: turn=" + myTurnCount + ", userIndex=" + currentUserIndex);

        if (myTurnCount >= 1) {
            loadChallenge();
        } else {
            print("TURN: Turn 0 — solo mode");
            script.stateMachine.startSolo();
        }
    } catch (e) {
        print("TURN: Error checking turn data: " + e + " — falling back to solo");
        script.stateMachine.startSolo();
    }
}

async function loadChallenge() {
    try {
        var rawData = await script.turnbased.getGlobalVariable("challengeData");
        if (!rawData) {
            print("TURN: No challenge data found, falling back to solo");
            script.stateMachine.startSolo();
            return;
        }

        var challengeData = JSON.parse(rawData);
        opponentScore = challengeData.score || 0;

        var success = script.choreographyManager.importDance(challengeData.dance);
        if (!success) {
            print("TURN: Failed to import dance data, falling back to solo");
            script.stateMachine.startSolo();
            return;
        }

        isChallenge = true;
        var origDuration = challengeData.videoDuration || 0;
        print("TURN: Challenge loaded! Opponent score=" + opponentScore + ", videoDuration=" + origDuration);

        script.stateMachine.startChallengeUpload(opponentScore, origDuration);

    } catch (e) {
        print("TURN: Error loading challenge: " + e + " — falling back to solo");
        script.stateMachine.startSolo();
    }
}

// ============================================================
// RESULTS (called by StateMachine when Player 2 finishes)
// ============================================================

script.endChallenge = function (myScore) {
    if (!script.turnbased) return;

    script.turnbased.setScore(myScore);
    script.turnbased.setIsFinalTurn(true);
    script.turnbased.endTurn();

    print("TURN: Challenge complete! My score=" + myScore + ", Opponent=" + opponentScore);
};

// ============================================================
// INIT — register handler AND proactively check
// ============================================================
var startEvent = script.createEvent("OnStartEvent");
startEvent.bind(function () {
    if (!script.turnbased) {
        print("TURN: turnbased component not connected — solo only");
        script.stateMachine.startSolo();
        return;
    }

    // Register event handler (in case it fires later)
    script.turnbased.onTurnStart.add(function () {
        print("TURN: onTurnStart event fired");
        resolveMode();
    });

    // Also proactively check right now (in case onTurnStart already fired or won't fire)
    resolveMode();

    print("TURN: Controller initialized");
});
