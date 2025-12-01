// DevTools integration for GraphQL Testing Toolkit

try {
  // Create the GraphQL panel with Firefox compatibility
  const devtools = chrome.devtools || browser.devtools;

  if (devtools && devtools.panels && devtools.panels.create) {
    // Both Firefox and Chrome expect absolute path from extension root
    const panelPath = "/src/devtools/panel.html";

    const panelPromise = devtools.panels.create(
      "GraphQL Toolkit",
      "",
      panelPath
    );

    // Handle both promise and callback styles
    if (panelPromise && panelPromise.then) {
      // Promise style (modern browsers)
      panelPromise
        .then((panel) => {
          console.log("GraphQL Toolkit panel created");
          setupPanelEvents(panel);
        })
        .catch((error) => {
          console.error("Failed to create GraphQL Toolkit panel:", error);
        });
    } else {
      // Callback style (older Firefox versions)
      console.log("Using callback style for panel creation");
    }
  } else {
    console.error("DevTools API not available");
  }
} catch (error) {
  console.error("DevTools setup failed:", error);
}

function setupPanelEvents(panel) {
  if (!panel) return;

  try {
    // Handle panel events
    if (panel.onShown && panel.onShown.addListener) {
      panel.onShown.addListener((panelWindow) => {
        console.log("GraphQL Toolkit panel shown");
        if (panelWindow && typeof panelWindow.panelShown === "function") {
          panelWindow.panelShown();
        }
      });
    }

    if (panel.onHidden && panel.onHidden.addListener) {
      panel.onHidden.addListener((panelWindow) => {
        console.log("GraphQL Toolkit panel hidden");
        if (panelWindow && typeof panelWindow.panelHidden === "function") {
          panelWindow.panelHidden();
        }
      });
    }
  } catch (error) {
    console.error("Panel events setup failed:", error);
  }
}
