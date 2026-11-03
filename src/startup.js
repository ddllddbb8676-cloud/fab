import {startGame} from './startup-controller.js';
import {multiplayerConfiguration} from './multiplayer.js';
import {prepareRoomConnection} from './room-connection.js';
// Prepare the existing session while the 3D modules download, not afterward.
window.__fabConnectionConfig=multiplayerConfiguration().then(config=>{
  window.__fabPreparedRoom=prepareRoomConnection(config);return config;
});
const script=document.querySelector('script[data-fab-entry]');
startGame({entry:script.dataset.fabEntry});
