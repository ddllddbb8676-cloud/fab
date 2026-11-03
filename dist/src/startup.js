import {startGame} from './startup-controller.js?v=3b3540953567';
import {multiplayerConfiguration,embeddedRoomConfig} from './room-config.js?v=3b3540953567';
const script=document.querySelector('script[data-fab-entry]');
// The production document already set the same HttpOnly session cookie.
// Static/local pages still use the original configuration discovery.
window.__fabConnectionConfig=embeddedRoomConfig(script.dataset.roomTime)??multiplayerConfiguration();
startGame({entry:script.dataset.fabEntry});
