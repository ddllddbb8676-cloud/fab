import {startGame} from './startup-controller.js?v=f4d57efc026d';
import {multiplayerConfiguration,embeddedRoomConfig} from './room-config.js?v=f4d57efc026d';
import {startUsageTelemetry} from './usage-telemetry.js?v=f4d57efc026d';
const script=document.querySelector('script[data-fab-entry]');
const telemetry=startUsageTelemetry({entry:script.dataset.fabEntry});
// The production document already set the same HttpOnly session cookie.
// Static/local pages still use the original configuration discovery.
window.__fabConnectionConfig=embeddedRoomConfig(script.dataset.roomTime)??multiplayerConfiguration();
void Promise.resolve(window.__fabConnectionConfig).then(config=>{if(config?.multiplayer)telemetry.sessionReady();}).catch(()=>{});
startGame({entry:script.dataset.fabEntry});
