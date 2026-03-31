// PresetManager.js - Preset Dance Video Selection
// Manages 3 bundled dance videos that users can select instead of uploading their own.
// Each preset video goes through the same body-tracking recording pipeline as an upload.

//@input Component.ScriptComponent stateMachine {"label": "State Machine"}
//@input Component.ScriptComponent choreographyManager {"label": "Choreography Manager"}

//@input Asset.Texture presetVideo1 {"label": "Preset Video 1"}
//@input Asset.Texture presetVideo2 {"label": "Preset Video 2"}

//@input SceneObject thumbnail1 {"label": "Thumbnail 1 (Image SceneObject)"}
//@input SceneObject thumbnail2 {"label": "Thumbnail 2 (Image SceneObject)"}

//@input SceneObject presetContainer {"label": "Preset Selection Container"}
//@input SceneObject uploadButton {"label": "Upload Button (SceneObject)"}

var presetVideos = [];

// ============================================================
// INIT
// ============================================================
var startEvent = script.createEvent("OnStartEvent");
startEvent.bind(function () {
    presetVideos = [script.presetVideo1, script.presetVideo2];

    var thumbnails = [script.thumbnail1, script.thumbnail2];
    for (var i = 0; i < thumbnails.length; i++) {
        if (thumbnails[i]) {
            setupThumbnailTap(thumbnails[i], i);
        }
    }

    if (script.uploadButton) {
        setupUploadTap(script.uploadButton);
    }
});

// ============================================================
// TAP HANDLING
// ============================================================
function setupThumbnailTap(thumbObj, index) {
    var interaction = thumbObj.getComponent("Component.InteractionComponent");
    if (!interaction) {
        print("PRESET: WARNING - No InteractionComponent on thumbnail " + index + ", adding one");
        interaction = thumbObj.createComponent("Component.InteractionComponent");
    }
    interaction.onTap.add(function () {
        print("PRESET: Thumbnail " + index + " tapped");
        selectPreset(index);
    });
}

function setupUploadTap(uploadObj) {
    var interaction = uploadObj.getComponent("Component.InteractionComponent");
    if (!interaction) {
        interaction = uploadObj.createComponent("Component.InteractionComponent");
    }
    interaction.onTap.add(function () {
        print("PRESET: Upload tapped");
        startUpload();
    });
}

// ============================================================
// PRESET SELECTION
// ============================================================
function selectPreset(index) {
    var videoTex = presetVideos[index];
    if (!videoTex) {
        print("PRESET: ERROR - No video texture for preset " + index);
        return;
    }

    hidePresetUI();
    script.choreographyManager.startPresetVideo(videoTex);
    script.stateMachine.enterPresetLoading();
}

function startUpload() {
    hidePresetUI();
    script.stateMachine.startVideoUpload();
}

// ============================================================
// UI VISIBILITY
// ============================================================
script.showPresetUI = function () {
    if (script.presetContainer) script.presetContainer.enabled = true;
    if (script.uploadButton) script.uploadButton.enabled = true;
    if (script.thumbnail1) script.thumbnail1.enabled = true;
    if (script.thumbnail2) script.thumbnail2.enabled = true;
};

function hidePresetUI() {
    if (script.presetContainer) script.presetContainer.enabled = false;
    if (script.uploadButton) script.uploadButton.enabled = false;
    if (script.thumbnail1) script.thumbnail1.enabled = false;
    if (script.thumbnail2) script.thumbnail2.enabled = false;
}

script.hidePresetUI = hidePresetUI;
