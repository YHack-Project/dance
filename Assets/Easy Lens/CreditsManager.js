// CreditsManager.js - Credits overlay for dance content attribution

//@input SceneObject creditsButton {"label": "Credits Button"}
//@input SceneObject creditsPanel {"label": "Credits Panel"}

var creditsOpen = false;
var sharePromptActive = false;

script.showButton = function () {
    sharePromptActive = true;
    if (script.creditsButton) script.creditsButton.enabled = true;
    if (script.creditsPanel) script.creditsPanel.enabled = false;
    creditsOpen = false;
};

script.hideButton = function () {
    sharePromptActive = false;
    if (script.creditsButton) script.creditsButton.enabled = false;
    if (script.creditsPanel) script.creditsPanel.enabled = false;
    creditsOpen = false;
};

script.isCreditsOpen = function () {
    return creditsOpen;
};

var startEvent = script.createEvent("OnStartEvent");
startEvent.bind(function () {
    if (script.creditsButton) {
        var btnInteraction = script.creditsButton.getComponent("Component.InteractionComponent");
        if (btnInteraction) {
            btnInteraction.onTap.add(function () {
                creditsOpen = true;
                script.creditsButton.enabled = false;
                if (script.creditsPanel) script.creditsPanel.enabled = true;
            });
        }
    }

    if (script.creditsPanel) {
        var panelInteraction = script.creditsPanel.getComponent("Component.InteractionComponent");
        if (panelInteraction) {
            panelInteraction.onTap.add(function () {
                creditsOpen = false;
                if (script.creditsPanel) script.creditsPanel.enabled = false;
                if (sharePromptActive && script.creditsButton) {
                    script.creditsButton.enabled = true;
                }
            });
        }
    }

    // Both hidden at start
    if (script.creditsButton) script.creditsButton.enabled = false;
    if (script.creditsPanel) script.creditsPanel.enabled = false;
});
