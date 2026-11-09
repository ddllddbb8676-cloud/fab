import {BAY_CENTERS} from './layout.js?v=bb8913c38810';

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

export function gatheringPoint(team, seat = 0) {
  const zone = CONTEST_ZONES.find(zone => zone.team === team);
  if (!zone) return {x:0, z:(CONTEST_ZONES[0].z + CONTEST_ZONES[1].z) / 2};
  if (seat === 0) return {x:zone.x, z:zone.z};
  // Seat one player in the center, then distribute teammates in rings of 6, 12, 18…
  let ring = 1, slot = seat - 1;
  while (slot >= 6 * ring) {
    slot -= 6 * ring;
    ring++;
  }
  const angle = (slot + (ring % 2) / 2) * Math.PI / (3 * ring);
  const radius = Math.min(.60 * ring, CONTEST_RULES.radius - .30);
  return {x:zone.x + Math.sin(angle) * radius, z:zone.z + Math.cos(angle) * radius};
}

export function contestRewards(match) {
  return Object.fromEntries(['black','white'].map(team=>[team,
    match[team]*(match.winner==='tie'?CONTEST_RULES.tie:match.winner===team?CONTEST_RULES.win:CONTEST_RULES.lose)]));
}
