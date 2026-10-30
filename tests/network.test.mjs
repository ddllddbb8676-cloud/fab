import test from 'node:test';
import assert from 'node:assert/strict';
import { ports, bays, SEATED_FOUP_Y, CARRIED_FOUP_Y, PORT_SURFACE_Y, FOUP_BASE_OFFSET } from '../src/layout.js';
import { network, railPaths, findRoute, sampleRoute, joinRoutes } from '../src/rail-network.js';
import { createFleet, reservedPortIds } from '../src/network-transport.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const near = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) <= epsilon, `${a} differs from ${b}`);
function reachable(start, reverse = false) {
  const seen = new Set([start]), queue = [start];
  for (let i = 0; i < queue.length; i++) for (const id of network.nodes[queue[i]][reverse ? 'incoming' : 'outgoing']) {
    const n = network.edges[id][reverse ? 'from' : 'to'];
    if (!seen.has(n)) { seen.add(n); queue.push(n); }
  }
  return seen;
}
function lineDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
const physicalSegments = railPaths.flatMap(path => path.points.slice(1).map((b, i) => [path.points[i], b]));

test('every load port belongs to one strongly connected directed fab-wide rail network', () => {
  assert.equal(network.portNodes.size, ports.length);
  const start = network.portNodes.get(ports[0].id);
  const forward = reachable(start), backward = reachable(start, true);
  assert.equal(forward.size, network.nodes.length);
  assert.equal(backward.size, network.nodes.length);
  for (const p of ports) {
    const n = network.nodes[network.portNodes.get(p.id)];
    near(distance(n, p), 0);
    assert.ok(forward.has(n.id) && backward.has(n.id));
  }
  assert.ok(network.junctions.some(n => n.incoming.length + n.outgoing.length === 4));
  assert.ok(network.junctions.some(n => n.incoming.length + n.outgoing.length === 3));
});

test('routes reach distant opposite-bank ports and follow the visible rails through rounded switches', () => {
  for (let i = 0; i < bays.length; i += 3) {
    const from = bays[i].target, to = bays[(i + bays.length / 2 + 2) % bays.length].machines.at(-2).ports[1];
    const route = findRoute(from.id, to.id);
    near(distance(sampleRoute(route, 0), from), 0);
    near(distance(sampleRoute(route, route.length), to), 0);
    assert.ok(route.segments.some(s => s.type === 'arc'));
    for (let d = 0; d <= route.length; d += .7) {
      const p = sampleRoute(route, d);
      const closest = Math.min(...physicalSegments.map(([a, b]) => lineDistance(p, a, b)));
      assert.ok(closest < .002, `route leaves visible track by ${closest} m`);
    }
    for (const s of route.segments.slice(1)) {
      const a = sampleRoute(route, s.start - 1e-6), b = sampleRoute(route, s.start + 1e-6);
      assert.ok(distance(a, b) < 3e-6);
      assert.ok(Math.hypot(Math.sin(a.yaw) - Math.sin(b.yaw), Math.cos(a.yaw) - Math.cos(b.yaw)) < 1e-5);
    }
  }
});

test('joined empty-car circuits close without a position or direction jump', () => {
  const a = bays[7].target, b = bays[1].machines.at(-2).ports[1];
  const out = findRoute(a.id, b.id), back = findRoute(b.id, a.id), route = joinRoutes(out, back);
  near(distance(sampleRoute(route, 0), sampleRoute(route, route.length)), 0);
  const left = sampleRoute(route, out.length - 1e-5), right = sampleRoute(route, out.length + 1e-5);
  assert.ok(distance(left, right) < 3e-5);
  near(Math.sin(left.yaw), Math.sin(right.yaw)); near(Math.cos(left.yaw), Math.cos(right.yaw));
});

test('fleet reserves unique real ports and preserves one FOUP per vehicle through release and pickup', () => {
  const fleet = createFleet();
  assert.equal(fleet.vehicles.length, bays.length);
  assert.equal(reservedPortIds.size, bays.length * 2);
  const owned = fleet.vehicles.flatMap(v => [v.homePort.id, v.destinationPort.id]);
  assert.equal(new Set(owned).size, owned.length);
  assert.ok(owned.every(id => reservedPortIds.has(id)));
  const phases = new Set(); let sawParkedDeparture = false, sawCrossBankDelivery = false;
  for (let step = 0; step < 8000; step++) {
    const before = fleet.vehicles.map(v => v.state);
    fleet.step(.1);
    for (let i = 0; i < fleet.vehicles.length; i++) {
      const v = fleet.vehicles[i], s = v.state; phases.add(s.phase);
      assert.ok(Number.isFinite(s.foup.x + s.foup.y + s.foup.z));
      assert.ok(distance(before[i].car, s.car) <= .26 + 1e-6, 'car must not jump');
      assert.ok(Math.abs(before[i].foup.y - s.foup.y) < .09, 'hoist must not jump');
      if (s.lowered > 1e-6) { assert.equal(s.travelling, false); near(distance(s.car, s.target), 0); }
      if (s.parked) {
        near(distance(s.foup, s.target), 0); near(s.foup.y - FOUP_BASE_OFFSET, PORT_SURFACE_Y);
        if (s.travelling && distance(s.car, s.target) > 10) sawParkedDeparture = true;
      } else if (s.travelling) { near(distance(s.foup, s.car), 0); near(s.foup.y, CARRIED_FOUP_Y); }
      assert.ok(s.foup.y >= SEATED_FOUP_Y - 1e-8);
      if (v.delivered && bays[v.currentPort.bayId].bank !== bays[v.homePort.bayId].bank) sawCrossBankDelivery = true;
    }
  }
  assert.deepEqual([...phases].sort(), [0,1,2,3,4,5,6,7,8]);
  assert.ok(sawParkedDeparture && sawCrossBankDelivery);
  assert.ok(fleet.vehicles.every(v => v.delivered > 0), 'every car completes real inter-bay delivery');
});

test('junction reservations prevent collisions and keep all cars progressing over 1200 seconds', () => {
  const fleet = createFleet(); let minimum = Infinity, sawYield = false;
  const deliveredAt900 = [];
  for (let i = 0; i < 12000; i++) {
    fleet.step(.1); sawYield ||= fleet.stats.waiting > 0;
    if (i === 8999) deliveredAt900.push(...fleet.vehicles.map(v => v.delivered));
    for (let a = 0; a < fleet.vehicles.length; a++) for (let b = a + 1; b < fleet.vehicles.length; b++) {
      minimum = Math.min(minimum, distance(fleet.vehicles[a].state.car, fleet.vehicles[b].state.car));
    }
  }
  assert.ok(sawYield, 'a conflicting car yields at a reserved junction');
  assert.ok(minimum >= 1.64, `vehicles approached within ${minimum} m`);
  assert.ok(fleet.stats.delivered >= bays.length, 'traffic continues to make progress');
  assert.ok(fleet.vehicles.every((v, i) => v.delivered > deliveredAt900[i]), 'every car delivers again in the final 300 seconds');
});
