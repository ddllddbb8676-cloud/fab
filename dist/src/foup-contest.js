import {BAY_CENTERS} from './layout.js?v=aed74b929a2a';

export const CONTEST_NAME = '흑백 풉 쟁탈전';
export const CONTEST_RULES = Object.freeze({recruitMs:30_000, playMs:180_000, resultMs:12_000, radius:2.45, win:30, lose:15, tie:20});
export const CONTEST_ZONES = Object.freeze([1, 2, 3, 5, 6, 7].map((bay, i) =>
  Object.freeze({x:0, z:BAY_CENTERS[bay], team:i % 2 ? 'white' : 'black'})));
const suits = {white:'suit-default', black:'suit-black', referee:'suit-blue'};

export function contestOutfit(equipped, team) {
  return Object.hasOwn(suits, team) ? {...equipped, suit:suits[team]} : equipped;
}

export function contestZone(x, z) {
  return CONTEST_ZONES.find(zone => (x-zone.x)**2 + (z-zone.z)**2 <= CONTEST_RULES.radius**2)?.team ?? null;
}

export function gatheringPoint(index) {
  return {x:((index % 8) - 3.5) * .64, z:(Math.floor(index / 8) - 3) * .72};
}
