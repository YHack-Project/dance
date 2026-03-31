// StateMachine.js - Game State Controller
// Manages lens lifecycle: IDLE -> VIDEO_LOADING -> COUNTDOWN -> DANCING -> RESULTS

//@input Component.ScriptComponent choreographyManager
//@input Component.ScriptComponent scoringEngine
//@input Component.ScriptComponent uiManager
//@input Component.ScriptComponent turnController {"label": "Turn Controller"}
//@input SceneObject guideAvatar {"label": "Guide Avatar Root"}
//@input Component.ObjectTracking3D guideOT3D {"label": "Guide Avatar OT3D"}

var State = {
    IDLE: 0,
    COUNTDOWN: 1,
    DANCING: 2,
    RESULTS: 3,
    VIDEO_LOADING: 4,
    CHALLENGE_PROMPT: 5,
    WAITING: 6,
    CHALLENGE_UPLOAD: 7
};

var currentState = State.IDLE;
var countdownTimer = 3.0;
var danceTimer = 0.0;
var danceDuration = 0.0;
var videoLoadTimeout = 60.0;
var videoLoadTimer = 0.0;
var savedTrackingAsset = null; // saved OT3D asset to restore after dance
var videoStartedEarly = false;
var challengeMode = false;     // true when dancing a received challenge
var challengeOpponentScore = 0;
var challengePromptTimer = 0;
var resultsPhase = 0;          // 0 = showing score, 1 = showing "challenge?" prompt
var waitingTimer = 0;
var challengeVideoDuration = 0; // original video duration for soft lock
var DURATION_TOLERANCE = 3.0;   // ±3 seconds

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
            // Keep guide OT3D enabled so it follows user position.
            // ChoreographyManager's LateUpdate overrides rotations with choreography.
            script.choreographyManager.startPlayback();
            script.scoringEngine.reset();
            script.uiManager.showDancing();
            break;

        case State.RESULTS:
            script.choreographyManager.stopPlayback();
            var finalScore = script.scoringEngine.getFinalScore();
            var cpCount = script.scoringEngine.getCheckpointCount();
            if (challengeMode) {
                // Player 2 finished — show comparison
                var iWon = finalScore >= challengeOpponentScore;
                script.uiManager.showMultiplayerResults(finalScore, challengeOpponentScore, iWon);
                // End the turn-based game
                if (script.turnController) {
                    script.turnController.endChallenge(finalScore);
                }
                challengeMode = false;
            } else {
                resultsPhase = 0;
                script.uiManager.showResultsWithShare(finalScore, cpCount);
            }
            break;

        case State.CHALLENGE_PROMPT:
            challengePromptTimer = 2.5;
            script.uiManager.showChallengePrompt(challengeOpponentScore);
            break;

        case State.WAITING:
            waitingTimer = 15.0;
            script.uiManager.showWaiting();
            break;

        case State.CHALLENGE_UPLOAD:
            script.uiManager.showChallengeUpload();
            script.choreographyManager.initVideoPreviewOnly();
            break;
    }
}

// Called by TurnController when it's turn 0 (no challenge — normal solo play)
script.startSolo = function () {
    enterState(State.IDLE);
};

// Called by TurnController when a challenge is received — prompt Player 2 to upload video
script.startChallengeUpload = function (oppScore, origDuration) {
    challengeMode = true;
    challengeOpponentScore = oppScore;
    challengeVideoDuration = origDuration;
    enterState(State.CHALLENGE_UPLOAD);
};

// Legacy — direct challenge start (skips video upload)
script.startChallenge = function (oppScore) {
    challengeMode = true;
    challengeOpponentScore = oppScore;
    enterState(State.CHALLENGE_PROMPT);
};

// Tap to start / restart / send challenge
var tapEvent = script.createEvent("TapEvent");
tapEvent.bind(function () {
    if (currentState === State.IDLE) {
        videoStartedEarly = false;
        challengeMode = false;
        script.choreographyManager.resetToKeyframeMode();
        script.choreographyManager.initVideoMode();
        enterState(State.VIDEO_LOADING);
    } else if (currentState === State.RESULTS) {
        if (challengeMode) {
            // Player 2 finished — tap to dismiss
            videoStartedEarly = false;
            challengeMode = false;
            enterState(State.IDLE);
        } else if (resultsPhase === 0) {
            // First tap: show challenge/retry options
            resultsPhase = 1;
            script.uiManager.showSharePrompt();
        } else if (resultsPhase === 1) {
            // Second tap: send the challenge
            if (script.turnController) {
                script.turnController.sendChallenge();
            }
            resultsPhase = 0;
            enterState(State.IDLE);
        }
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
            // Start video 0.5s before dance so user sees it as reference
            if (countdownTimer <= 0.5 && !videoStartedEarly) {
                videoStartedEarly = true;
                script.choreographyManager.startVideoPreview();
            }
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

        case State.CHALLENGE_PROMPT:
            challengePromptTimer -= dt;
            if (challengePromptTimer <= 0) {
                enterState(State.COUNTDOWN);
            }
            break;

        case State.WAITING:
            waitingTimer -= dt;
            if (waitingTimer <= 0) {
                print("StateMachine: WAITING timed out, falling back to IDLE");
                enterState(State.IDLE);
            }
            // Show countdown in loading text
            if (Math.floor(waitingTimer) % 2 === 0) {
                script.uiManager.showWaiting();
            }
            break;

        case State.CHALLENGE_UPLOAD:
            // Poll for video pick + duration availability
            if (script.choreographyManager.isVideoPicked()) {
                var pickedDur = script.choreographyManager.getPickedVideoDuration();
                if (pickedDur > 0) {  // wait until duration is available
                    if (challengeVideoDuration <= 0 || Math.abs(pickedDur - challengeVideoDuration) <= DURATION_TOLERANCE) {
                        print("StateMachine: Video matched! picked=" + pickedDur.toFixed(1) + "s, original=" + challengeVideoDuration.toFixed(1) + "s");
                        enterState(State.CHALLENGE_PROMPT);
                    } else {
                        print("StateMachine: Wrong video! picked=" + pickedDur.toFixed(1) + "s, expected=" + challengeVideoDuration.toFixed(1) + "s");
                        script.choreographyManager.clearVideoPicked();
                        script.uiManager.showWrongVideo();
                        // Re-prompt after a short delay
                        var retryDelay = script.createEvent("DelayedCallbackEvent");
                        retryDelay.bind(function () {
                            if (currentState === State.CHALLENGE_UPLOAD) {
                                script.choreographyManager.initVideoPreviewOnly();
                                script.uiManager.showChallengeUpload();
                            }
                        });
                        retryDelay.reset(2.0);
                    }
                }
            }
            break;
    }
});

// Called by UI when user wants to challenge a friend
script.challengeFriend = function () {
    if (script.turnController) {
        script.turnController.sendChallenge();
    }
};

// Initialize
var startEvent = script.createEvent("OnStartEvent");
startEvent.bind(function () {
    if (script.turnController) {
        // Wait for TurnController to determine if this is a challenge or solo
        enterState(State.WAITING);
    } else {
        enterState(State.IDLE);
    }
});
