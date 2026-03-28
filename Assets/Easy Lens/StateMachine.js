// StateMachine.js - Game State Controller
// Manages lens lifecycle: IDLE -> COUNTDOWN -> DANCING -> RESULTS

//@input Component.ScriptComponent choreographyManager
//@input Component.ScriptComponent scoringEngine
//@input Component.ScriptComponent uiManager
//@input SceneObject guideAvatar {"label": "Guide Avatar Root"}

var State = {
    IDLE: 0,
    COUNTDOWN: 1,
    DANCING: 2,
    RESULTS: 3
};

var currentState = State.IDLE;
var countdownTimer = 3.0;
var danceTimer = 0.0;
var danceDuration = 0.0;

script.getState = function () {
    return currentState;
};

script.getDanceTimer = function () {
    return danceTimer;
};

function enterState(newState) {
    currentState = newState;

    // Show guide avatar only during dance
    if (script.guideAvatar) {
        script.guideAvatar.enabled = (newState === State.DANCING);
    }

    switch (newState) {
        case State.IDLE:
            script.uiManager.showIdle();
            break;

        case State.COUNTDOWN:
            countdownTimer = 3.0;
            script.uiManager.showCountdown(3);
            break;

        case State.DANCING:
            danceTimer = 0.0;
            danceDuration = script.choreographyManager.getDuration();
            script.choreographyManager.startPlayback();
            script.scoringEngine.reset();
            script.uiManager.showDancing();
            break;

        case State.RESULTS:
            script.choreographyManager.stopPlayback();
            var finalScore = script.scoringEngine.getFinalScore();
            script.uiManager.showResults(finalScore);
            break;
    }
}

// Tap to start / restart
var tapEvent = script.createEvent("TapEvent");
tapEvent.bind(function () {
    if (currentState === State.IDLE || currentState === State.RESULTS) {
        enterState(State.COUNTDOWN);
    }
});

// Main update loop
var updateEvent = script.createEvent("UpdateEvent");
updateEvent.bind(function (eventData) {
    var dt = eventData.getDeltaTime();

    switch (currentState) {
        case State.COUNTDOWN:
            countdownTimer -= dt;
            var display = Math.ceil(countdownTimer);
            if (display < 1) display = 1;
            script.uiManager.showCountdown(display);
            if (countdownTimer <= 0) {
                enterState(State.DANCING);
            }
            break;

        case State.DANCING:
            danceTimer += dt;
            script.choreographyManager.update(dt);
            script.scoringEngine.update();
            script.uiManager.updateProgress(danceTimer / danceDuration);
            if (danceTimer >= danceDuration) {
                enterState(State.RESULTS);
            }
            break;
    }
});

// Initialize
var startEvent = script.createEvent("OnStartEvent");
startEvent.bind(function () {
    enterState(State.IDLE);
});
