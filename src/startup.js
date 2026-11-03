import {startGame} from './startup-controller.js';
import {multiplayerConfiguration} from './multiplayer.js';
// Fetch session configuration while modules download. The room socket starts
// in main after those downloads, before 3D construction, to avoid overlapping
// same-host HTTP and WebSocket handshakes in iOS in-app browsers.
window.__fabConnectionConfig=multiplayerConfiguration();
const script=document.querySelector('script[data-fab-entry]');
startGame({entry:script.dataset.fabEntry});
