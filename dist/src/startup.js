import {startGame} from './startup-controller.js?v=218841553b08';
import {multiplayerConfiguration,embeddedRoomConfig} from './room-config.js?v=218841553b08';
const script=document.querySelector('script[data-fab-entry]');
// The production document already set the same HttpOnly session cookie.
// Static/local pages still use the original configuration discovery.
window.__fabConnectionConfig=embeddedRoomConfig(script.dataset.roomTime)??multiplayerConfiguration();
startGame({entry:script.dataset.fabEntry});
