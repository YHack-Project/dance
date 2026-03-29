// StateMachine.js - Game State Controller
// Manages lens lifecycle: IDLE -> VIDEO_LOADING -> COUNTDOWN -> DANCING -> RESULTS

//@input Component.ScriptComponent choreographyManager
//@input Component.ScriptComponent scoringEngine
//@input Component.ScriptComponent uiManager
//@input SceneObject guideAvatar {"label": "Guide Avatar Root"}
//@input Component.ObjectTracking3D guideOT3D {"label": "Guide Avatar OT3D"}

var State = {
    IDLE: 0,
    COUNTDOWN: 1,
    DANCING: 2,
    RESULTS: 3,
    VIDEO_LOADING: 4
};

var currentState = State.IDLE;
var countdownTimer = 3.0;
var danceTimer = 0.0;
var danceDuration = 0.0;
var videoLoadTimeout = 60.0;
var videoLoadTimer = 0.0;
var savedTrackingAsset = null; // saved OT3D asset to restore after dance

script.getState = function () {
    return currentState;
};

script.getDanceTimer = function () {
    return danceTimer;
};

function enterState(newState) {
    currentState = newState;

    // Show guide avatar during countdown (so OT3D can position it) and dance
    if (script.guideAvatar) {
        script.guideAvatar.enabled = (newState === State.COUNTDOWN || newState === State.DANCING);
    }

    switch (newState) {
        case State.IDLE:
            script.uiManager.showIdle();
            break;

        case State.VIDEO_LOADING:
            videoLoadTimer = 0.0;
            script.uiManager.showVideoLoading();
            break;

        case State.COUNTDOWN:
            countdownTimer = 3.0;
            script.uiManager.showCountdown(3);
            break;

        case State.DANCING:
            danceTimer = 0.0;
            danceDuration = script.choreographyManager.getDuration();
            print("StateMachine: DANCING - duration=" + danceDuration.toFixed(1) + "s, videoMode=" + script.choreographyManager.isVideoMode());
            // Fully disconnect guide OT3D so its native tracking pipeline
            // can't overwrite our choreography rotations (critical on mobile)
            if (script.guideOT3D) {
                savedTrackingAsset = script.guideOT3D.trackingAsset;
                script.guideOT3D.trackingAsset = null;
                script.guideOT3D.enabled = false;
            }
            script.choreographyManager.startPlayback();
            script.scoringEngine.reset();
            script.uiManager.showDancing();
            break;

        case State.RESULTS:
            script.choreographyManager.stopPlayback();
            // Re-enable guide OT3D for next round
            if (script.guideOT3D) {
                if (savedTrackingAsset) script.guideOT3D.trackingAsset = savedTrackingAsset;
                script.guideOT3D.enabled = true;
            }
            var finalScore = script.scoringEngine.getFinalScore();
            script.uiManager.showResults(finalScore);
            break;
    }
}

// Tap to start / restart
var tapEvent = script.createEvent("TapEvent");
tapEvent.bind(function () {
    if (currentState === State.IDLE || currentState === State.RESULTS) {
        script.choreographyManager.resetToKeyframeMode();
        script.choreographyManager.initVideoMode();
        enterState(State.VIDEO_LOADING);
    }
});

// Main update loop
var updateEvent = script.createEvent("UpdateEvent");
updateEvent.bind(function (eventData) {
    var dt = eventData.getDeltaTime();

    switch (currentState) {
        case State.VIDEO_LOADING:
            videoLoadTimer += dt;

            // Poll for video readiness (handles cases where onPlaybackReady doesn't fire)
            script.choreographyManager.pollVideoReady();

            // Drive pose recording from video
            if (script.choreographyManager.isRecording()) {
                script.choreographyManager.updateRecording(dt);
                var progress = script.choreographyManager.getRecordingProgress();
                script.uiManager.showRecordingProgress(progress);
            }

            if (script.choreographyManager.isVideoReady()) {
                enterState(State.COUNTDOWN);
            } else if (script.choreographyManager.isRecordingFailed()) {
                print("StateMachine: Recording failed (too few poses), falling back to keyframe mode");
                script.choreographyManager.resetToKeyframeMode();
                enterState(State.COUNTDOWN);
            } else if (videoLoadTimer >= videoLoadTimeout) {
                print("StateMachine: Video load timed out");
                script.choreographyManager.resetToKeyframeMode();
                enterState(State.IDLE);
            }
            break;

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
            danceTimer += dt * script.choreographyManager.getPlaybackSpeed();
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
