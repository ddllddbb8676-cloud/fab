import {startGame} from './startup-controller.js?v=468b75afb7f9';
import {multiplayerConfiguration,embeddedRoomConfig} from './room-config.js?v=468b75afb7f9';
import {startUsageTelemetry} from './usage-telemetry.js?v=468b75afb7f9';
const script=document.querySelector('script[data-fab-entry]');
const telemetry=startUsageTelemetry({entry:script.dataset.fabEntry});
// The production document already set the same HttpOnly session cookie.
// Static/local pages still use the original configuration discovery.
window.__fabConnectionConfig=embeddedRoomConfig(script.dataset.roomTime)??multiplayerConfiguration();
void Promise.resolve(window.__fabConnectionConfig).then(config=>{if(config?.multiplayer)telemetry.sessionReady();}).catch(()=>{});
startGame({entry:script.dataset.fabEntry});
