// ChoreographyManager.js - Choreography Data & Guide Avatar Animation
// Supports two modes:
//   Keyframe mode: hardcoded dance with SLERP interpolation
//   Video mode: extracts poses from uploaded video, stores as keyframes, then plays back

//@input SceneObject guideSkeletonRoot {"label": "Guide Skeleton Root (Hips)"}
//@input SceneObject videoSkeletonRoot {"label": "Video Skeleton Root (Hips)"}
//@input Asset.Texture mediaPickerTexture {"label": "Media Picker Texture"}
//@input Asset.TextureTrackingScope videoTrackingScope {"label": "Video Tracking Scope"}
//@input Asset.PersonTrackingScope videoPersonScope {"label": "Video Person Scope"}
//@input SceneObject videoPreview {"label": "Video Preview Screen Image"}
//@input float playbackSpeed = 1.0 {"label": "Playback Speed", "widget": "slider", "min": 0.25, "max": 1.5, "step": 0.25}
//@input float guideLead = 0.0 {"label": "Guide Lead Time (s)", "widget": "slider", "min": 0.0, "max": 2.0, "step": 0.1}

var JOINT_NAMES = [
    "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForearm", "LeftHand",
    "RightShoulder", "RightArm", "RightForearm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot",
    "RightUpLeg", "RightLeg", "RightFoot"
];

var guideJoints = {};
var restRotations = {};
var videoJoints = {};
var playing = false;
var currentTime = 0.0;

// Video mode state
var videoMode = false;
var videoDuration = 0.0;
var videoReady = false;
var CHECKPOINT_INTERVAL = 1.0;

// Recording state
var recording = false;
var recordedPoses = [];
var recordTime = 0.0;
var RECORD_INTERVAL = 0.2;
var lastRecordSample = 0.0;
var recordingProgress = 0.0;
var activeDance = null;

// Callback guard - prevents duplicate setup
var callbacksInitialized = false;
var videoPicked = false; // true after user picks a file, cleared when recording starts
var expectingPick = false; // true only after picker is shown, prevents stale auto-picks
var videoOT3D = null; // cached reference to Video Skeleton's ObjectTracking3D

// Recording failure flag
var recordingFailed = false;

// Video preview state
var videoPreviewStarted = false;

// Preset video state
var presetMode = false;         // true when using a bundled preset video
var presetVideoTexture = null;  // the preset Asset.Texture (VideoTextureProvider)


// ============================================================
// DANCE DATA
// ============================================================
var DANCE = {
    name: "Basic Groove",
    duration: 16.0,
    poses: [
        { time: 0.0, joints: {} },
        { time: 2.0, joints: { "RightArm": [0, 0, 60], "RightForearm": [0, 0, 30] } },
        { time: 4.0, joints: { "LeftArm": [0, 0, -60], "LeftForearm": [0, 0, -30] } },
        { time: 6.0, joints: { "RightArm": [0, 0, 80], "RightForearm": [0, 0, 20], "LeftArm": [0, 0, -80], "LeftForearm": [0, 0, -20] } },
        { time: 8.0, joints: { "LeftUpLeg": [-35, 0, 0], "LeftLeg": [55, 0, 0], "RightUpLeg": [-35, 0, 0], "RightLeg": [55, 0, 0], "Spine": [-10, 0, 0] } },
        { time: 10.0, joints: { "Spine": [0, 0, 15], "Spine1": [0, 0, 5], "RightArm": [-20, 0, 50] } },
        { time: 12.0, joints: { "Spine": [0, 0, -15], "Spine1": [0, 0, -5], "LeftArm": [-20, 0, -50] } },
        { time: 14.0, joints: { "RightArm": [-20, 0, 55], "LeftArm": [-20, 0, -55], "LeftUpLeg": [-25, 0, 0], "LeftLeg": [40, 0, 0], "RightUpLeg": [-25, 0, 0], "RightLeg": [40, 0, 0] } },
        { time: 16.0, joints: {} }
    ],
    checkpoints: [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0]
};

// ============================================================
// HELPERS
// ============================================================
function findJoints(root, target) {
    if (!root) return;
    var name = root.name;
    if (JOINT_NAMES.indexOf(name) >= 0) target[name] = root;
    for (var i = 0; i < root.getChildrenCount(); i++) findJoints(root.getChild(i), target);
}

var DEG2RAD = Math.PI / 180.0;

function eulerToQuat(rx, ry, rz) {
    return quat.fromEulerAngles(rx * DEG2RAD, ry * DEG2RAD, rz * DEG2RAD);
}

function copyQuat(src) {
    return quat.quatIdentity().multiply(src);
}

function getJointRotationAtPose(pose, jointName) {
    if (pose.joints[jointName]) {
        var r = pose.joints[jointName];
        if (Array.isArray(r)) return eulerToQuat(r[0], r[1], r[2]);
        return r;
    }
    return quat.quatIdentity();
}

// ============================================================
// POSE RECORDING
// ============================================================
function captureCurrentVideoFrame() {
    var pose = { time: recordTime, joints: {} };
    var hasAny = false;
    for (var i = 0; i < JOINT_NAMES.length; i++) {
        var name = JOINT_NAMES[i];
        if (videoJoints[name]) {
            pose.joints[name] = copyQuat(videoJoints[name].getTransform().getLocalRotation());
            hasAny = true;
        }
    }
    if (hasAny) {
        if (recordedPoses.length === 0) {
            var sample = pose.joints["RightArm"];
            if (sample) print("CHOREO: First RightArm quat: " + sample.x.toFixed(3) + "," + sample.y.toFixed(3) + "," + sample.z.toFixed(3) + "," + sample.w.toFixed(3));
            print("CHOREO: First frame has " + Object.keys(pose.joints).length + " joints");
        }
        recordedPoses.push(pose);
    } else {
        if (recordedPoses.length === 0 && recordTime > 1.0) {
            print("CHOREO: WARNING - No joints tracked at " + recordTime.toFixed(2) + "s (video body tracking may not be working)");
        }
    }
}

function finishRecording() {
    recording = false;

    // Stop video (preset or media picker)
    try {
        var vc;
        if (presetMode && presetVideoTexture) {
            vc = presetVideoTexture.control;
        } else if (script.mediaPickerTexture) {
            vc = script.mediaPickerTexture.control.videoControl;
        }
        if (vc) vc.pause();
    } catch (e) {}

    videoDuration = recordTime;

    // Guard: if too few poses were captured, signal failure
    if (recordedPoses.length < 3) {
        print("CHOREO: WARNING - Only " + recordedPoses.length + " poses captured, recording failed");
        videoMode = false;
        videoReady = false;
        recordingFailed = true;
        activeDance = null;
        return;
    }

    videoReady = true;

    activeDance = {
        duration: videoDuration,
        poses: recordedPoses,
        checkpoints: []
    };
    for (var t = CHECKPOINT_INTERVAL; t < videoDuration - 0.5; t += CHECKPOINT_INTERVAL) {
        activeDance.checkpoints.push(t);
    }

    print("CHOREO: Recording done - " + recordedPoses.length + " poses, " + videoDuration.toFixed(1) + "s, " + (recordedPoses.length > 0 ? Object.keys(recordedPoses[0].joints).length : 0) + " joints/pose");
}

script.updateRecording = function (dt) {
    if (!recording) return;
    recordTime += dt;
    recordingProgress = videoDuration > 0 ? Math.min(recordTime / videoDuration, 1.0) : 0;

    if (recordTime - lastRecordSample >= RECORD_INTERVAL) {
        captureCurrentVideoFrame();
        lastRecordSample = recordTime;
    }

    if (videoDuration > 0 && recordTime >= videoDuration) {
        finishRecording();
    }
};

script.getRecordingProgress = function () { return recordingProgress; };
script.isRecording = function () { return recording; };

// ============================================================
// VIDEO MODE
// ============================================================
// Tracking scopes are pre-configured in asset files:
// 3D Body Tracking 2 → Video Person Scope → Video Tracking Scope → Media Picker Texture

function startRecordingFromVideo() {
    var vc = script.mediaPickerTexture.control.videoControl;
    if (!vc) {
        print("CHOREO: No videoControl, aborting");
        videoMode = false;
        return;
    }

    videoDuration = vc.duration;
    print("CHOREO: Video duration=" + videoDuration.toFixed(1) + "s, starting recording");

    recording = true;
    recordTime = 0.0;
    lastRecordSample = 0.0;
    recordedPoses = [];
    recordingProgress = 0.0;

    // Seek to start and play once
    vc.seek(0);
    try { vc.play(1); } catch (e) {}
}

script.initVideoMode = function () {
    if (!script.mediaPickerTexture) {
        print("CHOREO: ERROR - mediaPickerTexture not set!");
        return;
    }

    videoMode = true;
    videoReady = false;
    recording = false;
    recordedPoses = [];
    activeDance = null;
    recordingFailed = false;
    videoPicked = false;

    var provider = script.mediaPickerTexture.control;
    provider.isVideoPickingEnabled = true;
    provider.isImagePickingEnabled = false;
    provider.isFaceImagePickingEnabled = false;

    // Set up callbacks ONCE to avoid accumulation
    if (!callbacksInitialized) {
        callbacksInitialized = true;

        provider.setFilePickedCallback(function () {
            if (!expectingPick) {
                print("CHOREO: Ignoring stale file pick");
                return;
            }
            expectingPick = false;
            provider.hideMediaPicker();
            print("CHOREO: File picked");

            if (!provider.videoControl) {
                print("CHOREO: Not a video");
                videoMode = false;
                return;
            }
            provider.videoControl.volume = 0;
            provider.videoControl.play(1);
            videoPicked = true;
            print("CHOREO: Video loading, waiting for duration...");
        });
    }

    // Show picker with a two-stage delay:
    // 1. Show the picker (may trigger stale auto-pick from cached selection)
    // 2. Only start accepting picks after another short delay
    var pickerDelay = script.createEvent("DelayedCallbackEvent");
    pickerDelay.bind(function () {
        provider.showMediaPicker();
        print("CHOREO: Media picker shown, arming pick listener...");
        var armDelay = script.createEvent("DelayedCallbackEvent");
        armDelay.bind(function () {
            expectingPick = true;
            print("CHOREO: Now accepting picks");
        });
        armDelay.reset(0.3);
    });
    pickerDelay.reset(0.5);
};

script.isVideoReady = function () { return videoMode && videoReady; };
script.isVideoMode = function () { return videoMode; };
script.isRecordingFailed = function () { return recordingFailed; };
script.getPlaybackSpeed = function () { return script.playbackSpeed; };

// Called every frame during VIDEO_LOADING to poll for video readiness.
// Once the video has a valid duration, starts recording.
script.pollVideoReady = function () {
    if (!videoPicked || recording || videoReady || recordingFailed) return;
    try {
        var vc = script.mediaPickerTexture.control.videoControl;
        if (vc && vc.duration > 0) {
            print("CHOREO: Video ready (duration=" + vc.duration.toFixed(1) + "s), starting recording");
            videoPicked = false;
            startRecordingFromVideo();
        }
    } catch (e) {}
};

script.resetToKeyframeMode = function () {
    videoMode = false;
    videoReady = false;
    videoDuration = 0.0;
    recording = false;
    recordedPoses = [];
    activeDance = null;
    recordingProgress = 0.0;
    recordingFailed = false;
    videoPicked = false;
    expectingPick = false;
    videoPreviewStarted = false;
    presetMode = false;
    presetVideoTexture = null;
    if (script.videoPreview) script.videoPreview.enabled = false;
    // Restore tracking scope to MediaPickerTexture
    if (script.videoTrackingScope && script.mediaPickerTexture) {
        script.videoTrackingScope.texture = script.mediaPickerTexture;
    }
};

// ============================================================
// PRESET VIDEO MODE
// ============================================================
script.startPresetVideo = function (videoTexture) {
    if (!videoTexture) {
        print("CHOREO: ERROR - No preset video texture provided");
        return;
    }

    videoMode = true;
    presetMode = true;
    videoReady = false;
    recording = false;
    recordedPoses = [];
    activeDance = null;
    recordingFailed = false;
    videoPicked = false;
    presetVideoTexture = videoTexture;

    // Swap the tracking scope to read from the preset video instead of MediaPicker
    if (script.videoTrackingScope) {
        script.videoTrackingScope.texture = videoTexture;
        print("CHOREO: Tracking scope texture swapped to preset video");
    }

    // Start playing the preset video silently for body tracking extraction
    var vc = videoTexture.control;
    if (vc) {
        vc.volume = 0;
        vc.play(1);
        print("CHOREO: Preset video playing for pose extraction");
    }

    // Mark as picked so pollVideoReady will start recording once duration is available
    videoPicked = true;
};

// Poll for preset video readiness (same as regular but uses preset texture)
script.pollPresetVideoReady = function () {
    if (!presetMode || !presetVideoTexture || recording || videoReady || recordingFailed) return;
    try {
        var vc = presetVideoTexture.control;
        if (vc && vc.duration > 0) {
            print("CHOREO: Preset video ready (duration=" + vc.duration.toFixed(1) + "s), starting recording");
            startRecordingFromPreset();
        }
    } catch (e) {}
};

function startRecordingFromPreset() {
    var vc = presetVideoTexture.control;
    if (!vc) {
        print("CHOREO: No videoControl on preset texture, aborting");
        videoMode = false;
        presetMode = false;
        return;
    }

    videoDuration = vc.duration;
    print("CHOREO: Preset video duration=" + videoDuration.toFixed(1) + "s, starting recording");

    recording = true;
    recordTime = 0.0;
    lastRecordSample = 0.0;
    recordedPoses = [];
    recordingProgress = 0.0;

    vc.seek(0);
    try { vc.play(1); } catch (e) {}
}

script.isPresetMode = function () { return presetMode; };

// ============================================================
// PUBLIC API
// ============================================================
script.getDuration = function () {
    if (videoMode && activeDance) return activeDance.duration;
    return DANCE.duration;
};

script.getCheckpoints = function () {
    if (videoMode && activeDance) return activeDance.checkpoints;
    return DANCE.checkpoints;
};

// Start video playback and show preview (called early during countdown)
function startVideoPreview() {
    if (videoPreviewStarted) return;
    if (!videoMode) return;
    videoPreviewStarted = true;

    // Choose the right texture source: preset video or media picker
    var previewTex = presetMode ? presetVideoTexture : script.mediaPickerTexture;
    if (!previewTex) return;

    try {
        var vc = presetMode ? previewTex.control : previewTex.control.videoControl;
        if (vc) {
            vc.stop();
            vc.seek(0);
            vc.play(-1);
            vc.volume = 1;
            print("CHOREO: Video preview started (preset=" + presetMode + "), duration=" + (vc.duration || 0).toFixed(1) + "s, volume=1");
        }
    } catch (e) {
        print("CHOREO: Video preview error: " + e);
    }

    if (script.videoPreview) {
        script.videoPreview.enabled = true;
        var img = script.videoPreview.getComponent("Component.Image");
        if (img && img.mainPass) {
            img.mainPass.baseTex = previewTex;
        }
    }
}

// Set up video for preview only (Player 2 challenge mode).
// Opens media picker but does NOT extract poses — uses already-imported dance.
script.initVideoPreviewOnly = function () {
    if (!script.mediaPickerTexture) return;

    var provider = script.mediaPickerTexture.control;
    provider.isVideoPickingEnabled = true;
    provider.isImagePickingEnabled = false;
    provider.isFaceImagePickingEnabled = false;

    videoPreviewStarted = false;
    videoPicked = false;
    expectingPick = false;

    if (!callbacksInitialized) {
        callbacksInitialized = true;
        provider.setFilePickedCallback(function () {
            if (!expectingPick) return;
            expectingPick = false;
            provider.hideMediaPicker();
            videoPicked = true;
            print("CHOREO: Preview-only video picked");
        });
    }

    var pickerDelay = script.createEvent("DelayedCallbackEvent");
    pickerDelay.bind(function () {
        provider.showMediaPicker();
        var armDelay = script.createEvent("DelayedCallbackEvent");
        armDelay.bind(function () {
            expectingPick = true;
        });
        armDelay.reset(0.3);
    });
    pickerDelay.reset(0.5);
};

// Check if a video has been picked (for preview-only mode)
script.isVideoPicked = function () { return videoPicked; };
script.clearVideoPicked = function () { videoPicked = false; };

// Get the picked video's duration (for soft lock validation)
script.getPickedVideoDuration = function () {
    try {
        var vc = script.mediaPickerTexture.control.videoControl;
        if (vc && vc.duration > 0) return vc.duration;
    } catch (e) {}
    return 0;
};

script.startVideoPreview = function () {
    startVideoPreview();
};

script.startPlayback = function () {
    playing = true;
    currentTime = 0.0;
    var dance = (videoMode && activeDance) ? activeDance : DANCE;
    print("CHOREO: startPlayback - guideJoints=" + Object.keys(guideJoints).length +
          ", poses=" + dance.poses.length +
          ", checkpoints=" + dance.checkpoints.length +
          ", videoMode=" + videoMode);
    if (videoMode && script.mediaPickerTexture) {
        // Start video if not already playing from early start
        if (!videoPreviewStarted) {
            startVideoPreview();
        }
    }
};

script.stopPlayback = function () {
    playing = false;
    if (videoMode) {
        try {
            var vc;
            if (presetMode && presetVideoTexture) {
                vc = presetVideoTexture.control;
            } else if (script.mediaPickerTexture) {
                vc = script.mediaPickerTexture.control.videoControl;
            }
            if (vc) vc.pause();
        } catch (e) {}
        if (script.videoPreview) script.videoPreview.enabled = false;
    }
};

script.getTime = function () { return currentTime; };

script.getCurrentRotations = function (atTime) {
    var dance = (videoMode && activeDance) ? activeDance : DANCE;
    if (dance.poses.length === 0) return null;

    var t = (atTime != null) ? atTime : currentTime;

    var poseA = dance.poses[0];
    var poseB = dance.poses[0];
    var blend = 0.0;

    for (var i = 0; i < dance.poses.length - 1; i++) {
        if (t >= dance.poses[i].time && t <= dance.poses[i + 1].time) {
            poseA = dance.poses[i];
            poseB = dance.poses[i + 1];
            var span = poseB.time - poseA.time;
            blend = span > 0 ? (t - poseA.time) / span : 0;
            break;
        }
    }

    var rotations = {};
    for (var j = 0; j < JOINT_NAMES.length; j++) {
        var name = JOINT_NAMES[j];
        var rotA = getJointRotationAtPose(poseA, name);
        var rotB = getJointRotationAtPose(poseB, name);
        rotations[name] = quat.slerp(rotA, rotB, blend);
    }
    return rotations;
};

// Pending rotations to apply in LateUpdate (after tracking system runs)
var pendingRotations = null;

script.update = function (dt) {
    if (!playing) return;

    currentTime += dt * script.playbackSpeed;
    var duration = script.getDuration();
    if (currentTime > duration) currentTime = duration;

    // Guide shows poses ahead of scoring time so the user can see what's coming
    var guideTime = Math.min(currentTime + script.guideLead, duration);
    pendingRotations = script.getCurrentRotations(guideTime);
};

// ============================================================
// INIT
// ============================================================
var startEvent = script.createEvent("OnStartEvent");
startEvent.bind(function () {
    if (!script.guideSkeletonRoot) {
        print("CHOREO: ERROR - guideSkeletonRoot not set!");
        return;
    }

    findJoints(script.guideSkeletonRoot, guideJoints);
    for (var i = 0; i < JOINT_NAMES.length; i++) {
        var name = JOINT_NAMES[i];
        if (guideJoints[name]) restRotations[name] = guideJoints[name].getTransform().getLocalRotation();
    }

    if (script.videoPreview) script.videoPreview.enabled = false;

    if (script.videoSkeletonRoot) {
        findJoints(script.videoSkeletonRoot, videoJoints);

        // Cache the OT3D component from the Video Skeleton hierarchy
        // Hips → SkeletonObject → StickFigure → 3DBodyTracking (has OT3D)
        try {
            var bodyTrackingObj = script.videoSkeletonRoot.getParent().getParent().getParent();
            videoOT3D = bodyTrackingObj.getComponent("Component.ObjectTracking3D");
            print("CHOREO: Video OT3D cached from '" + bodyTrackingObj.name + "', asset: " + (videoOT3D ? videoOT3D.trackingAsset.name : "null"));
        } catch (e) {
            print("CHOREO: ERROR caching OT3D: " + e);
        }

        print("CHOREO: Video skeleton: " + Object.keys(videoJoints).length + " joints");
    }

    print("CHOREO: Guide skeleton: " + Object.keys(guideJoints).length + " joints");
});

// ============================================================
// EXPORT / IMPORT — for turn-based multiplayer
// ============================================================

// Round a number to n decimal places
function round(v, n) {
    var f = Math.pow(10, n);
    return Math.round(v * f) / f;
}

// Export current dance as a compact serializable object
script.exportDance = function () {
    var dance = (videoMode && activeDance) ? activeDance : DANCE;
    if (!dance) return null;

    var compactPoses = [];
    for (var i = 0; i < dance.poses.length; i++) {
        var pose = dance.poses[i];
        var jointData = [];
        for (var j = 0; j < JOINT_NAMES.length; j++) {
            var name = JOINT_NAMES[j];
            if (pose.joints[name]) {
                var q = pose.joints[name];
                // Handle both quaternion objects and euler arrays
                if (q.x !== undefined) {
                    jointData.push(j, round(q.x, 3), round(q.y, 3), round(q.z, 3), round(q.w, 3));
                } else if (Array.isArray(q)) {
                    // Euler angles [rx, ry, rz] — convert to quat first
                    var quat_val = eulerToQuat(q[0], q[1], q[2]);
                    jointData.push(j, round(quat_val.x, 3), round(quat_val.y, 3), round(quat_val.z, 3), round(quat_val.w, 3));
                }
            }
        }
        compactPoses.push([round(pose.time, 2), jointData]);
    }

    return {
        d: round(dance.duration, 2),
        c: dance.checkpoints.map(function (t) { return round(t, 2); }),
        p: compactPoses
    };
};

// Import a received compact dance and set it as the active dance
script.importDance = function (data) {
    if (!data || !data.p) return false;

    var poses = [];
    for (var i = 0; i < data.p.length; i++) {
        var entry = data.p[i];
        var time = entry[0];
        var jointData = entry[1];
        var joints = {};

        // Each joint is stored as [jointIndex, x, y, z, w]
        for (var k = 0; k < jointData.length; k += 5) {
            var idx = jointData[k];
            var name = JOINT_NAMES[idx];
            joints[name] = quat.fromEulerVec(vec3.zero()); // placeholder
            joints[name].x = jointData[k + 1];
            joints[name].y = jointData[k + 2];
            joints[name].z = jointData[k + 3];
            joints[name].w = jointData[k + 4];
        }

        poses.push({ time: time, joints: joints });
    }

    activeDance = {
        duration: data.d,
        poses: poses,
        checkpoints: data.c || []
    };

    videoMode = true;
    videoReady = true;
    playing = false;
    currentTime = 0;

    print("CHOREO: Imported dance - " + poses.length + " poses, " + data.d + "s");
    return true;
};

// Apply rotations in LateUpdate so they run AFTER the OT3D tracking system.
// This ensures our choreography rotations aren't overwritten by body tracking.
var lateUpdate = script.createEvent("LateUpdateEvent");
lateUpdate.bind(function () {
    if (!pendingRotations) return;
    var rotations = pendingRotations;
    pendingRotations = null;

    for (var name in rotations) {
        if (guideJoints[name]) {
            if (videoMode && activeDance) {
                guideJoints[name].getTransform().setLocalRotation(rotations[name]);
            } else {
                var finalRot = restRotations[name]
                    ? restRotations[name].multiply(rotations[name])
                    : rotations[name];
                guideJoints[name].getTransform().setLocalRotation(finalRot);
            }
        }
    }

});
