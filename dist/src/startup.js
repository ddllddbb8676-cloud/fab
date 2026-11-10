import {startGame} from './startup-controller.js?v=67abbb4d1e8e';
import {multiplayerConfiguration,embeddedRoomConfig} from './room-config.js?v=67abbb4d1e8e';
import {startUsageTelemetry} from './usage-telemetry.js?v=67abbb4d1e8e';
const script=document.querySelector('script[data-fab-entry]');
const telemetry=startUsageTelemetry({entry:script.dataset.fabEntry});
// The production document already set the same HttpOnly session cookie.
// Static/local pages still use the original configuration discovery.
window.__fabConnectionConfig=embeddedRoomConfig(script.dataset.roomTime)??multiplayerConfiguration();
void Promise.resolve(window.__fabConnectionConfig).then(config=>{if(config?.multiplayer)telemetry.sessionReady();}).catch(()=>{});
startGame({entry:script.dataset.fabEntry});
