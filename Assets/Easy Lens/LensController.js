// Main Controller
//
// Made with Easy Lens

//@input Component.ScriptComponent face_events
//@input Component.ScriptComponent expression_text
//@input Component.ScriptComponent post_adjust


try {

// Lightweight rule-based expression classifier using Face Events
// Note: Only dynamic changes; assumes initial block properties set elsewhere.

// Keep text within safe region since content updates dynamically
script.expression_text.forceSafeRegion(true);

// Internal state flags
let facePresent = false;
let smiling = false;
let mouthOpen = false;
let kissing = false;
let browsRaised = false;
let browsLowered = false; // tracked via events to resolve "Serious"

// Helper: set on-screen label (split long lines if needed)
function setLabel(txt) {
    // Keep it concise; no mid-word breaks needed for these labels
    script.expression_text.text = txt;
}

// Derive a single label from state with strict priority:
// Kiss > Surprised (mouth open + brows raised) > Happy (smiling) > Shocked (mouth open) > Curious (brows raised) > Serious (brows lowered) > Neutral
function computeLabel() {
    if (!facePresent) {
        return "Center your face";
    }

    if (kissing) {
        return "Kiss";
    }

    if (mouthOpen && browsRaised) {
        return "Surprised";
    }

    if (smiling) {
        return "Happy";
    }

    if (mouthOpen) {
        return "Shocked";
    }

    if (browsRaised) {
        return "Curious";
    }

    if (browsLowered) {
        return "Serious";
    }

    return "Neutral";
}

// Update UI from current state
function refreshLabel() {
    setLabel(computeLabel());
}

// Face presence
script.face_events.onFaceFound.add(function() {
    facePresent = true;
    // On found, show a detecting state immediately
    setLabel("Detecting…");
});

script.face_events.onFaceLost.add(function() {
    facePresent = false;
    refreshLabel();
});

// Mouth open/close
script.face_events.onMouthOpened.add(function() {
    mouthOpen = true;
    refreshLabel();
});

script.face_events.onMouthClosed.add(function() {
    mouthOpen = false;
    refreshLabel();
});

// Smile start/finish
script.face_events.onSmileStarted.add(function() {
    smiling = true;
    refreshLabel();
});

script.face_events.onSmileFinished.add(function() {
    smiling = false;
    refreshLabel();
});

// Kiss start/finish
script.face_events.onKissStarted.add(function() {
    kissing = true;
    refreshLabel();
});

script.face_events.onKissFinished.add(function() {
    kissing = false;
    refreshLabel();
});

// Brows raised/lowered/normal
script.face_events.onBrowsRaised.add(function() {
    browsRaised = true;
    browsLowered = false;
    refreshLabel();
});

script.face_events.onBrowsLowered.add(function() {
    browsLowered = true;
    browsRaised = false;
    refreshLabel();
});

script.face_events.onBrowsNormal.add(function() {
    browsRaised = false;
    browsLowered = false;
    refreshLabel();
});

// Periodic resync to ensure consistency even if an event is missed
const RESYNC_INTERVAL = 0.2;
let resyncEvent = script.createEvent("DelayedCallbackEvent");
resyncEvent.bind(function() {
    refreshLabel();
    resyncEvent.reset(RESYNC_INTERVAL);
});
resyncEvent.reset(RESYNC_INTERVAL);

// Initialize label on start
let onStart = script.createEvent("OnStartEvent");
onStart.bind(function() {
    // Default to prompting user until a face is found
    setLabel("Center your face");
});

} catch(e) {
  print("error in controller");
  print(e);
}
