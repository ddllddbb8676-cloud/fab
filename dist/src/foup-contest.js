import {BAY_CENTERS} from './layout.js?v=8a9c64ec02d8';

export const CONTEST_NAME = '흑백 풉 쟁탈전';
export const CONTEST_RULES = Object.freeze({recruitMs:30_000, playMs:180_000, resultMs:12_000, radius:2.45, win:30, lose:15, tie:20});
export const CONTEST_ZONES = Object.freeze([4, 5].map((bay, i) =>
  Object.freeze({x:0, z:BAY_CENTERS[bay], team:i % 2 ? 'white' : 'black'})));
const suits = {white:'suit-default', black:'suit-black', referee:'suit-blue'};

export function contestOutfit(equipped, team) {
  return Object.hasOwn(suits, team) ? {...equipped, suit:suits[team]} : equipped;
}

export function contestZone(x, z) {
  return CONTEST_ZONES.find(zone => (x-zone.x)**2 + (z-zone.z)**2 <= CONTEST_RULES.radius**2)?.team ?? null;
}

export function gatheringPoint(index) {
  const middle=(CONTEST_ZONES[0].z+CONTEST_ZONES[1].z)/2;
  return {x:((index % 8) - 3.5) * .64, z:middle+(Math.floor(index / 8) - 6) * .5};
}

export function contestRewards(match) {
  return Object.fromEntries(['black','white'].map(team=>[team,
    match[team]*(match.winner==='tie'?CONTEST_RULES.tie:match.winner===team?CONTEST_RULES.win:CONTEST_RULES.lose)]));
}
