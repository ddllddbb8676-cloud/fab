import {items as catalog} from '../src/cosmetics-catalog.js';
import {configuredOwnerId} from './owner-privileges.js';

const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;

// This is an in-memory projection of the normal profile load/save path. It
// neither reads storage nor keeps names, balances, or authentication values.
export function createProfileMetrics({ownerId = '', excludedIds = []} = {}) {
  const excluded = new Set(excludedIds);
  const owner = configuredOwnerId(ownerId);
  if (owner) excluded.add(owner);
  const paid = new Map(catalog.filter(item => Number.isSafeInteger(item.price) && item.price > 0).map(item => [item.id, item]));
  const rows = new Map([...paid.values()].map(item => [item.id, {id:item.id, name:item.name, price:item.price, owned:0, equipped:0}]));
  const contributions = new Map();
  const totals = {accounts:0, brokenAccounts:0, totalBroken:0, totalRepaired:0, buyers:0, paidCopies:0, priceValue:0, nicknamePurchases:0};

  function contribution(profile) {
    const owned = [...new Set(Array.isArray(profile.wallet?.owned) ? profile.wallet.owned : [])].filter(id => paid.has(id));
    const equipped = owned.filter(id => profile.wallet?.equipped?.[paid.get(id).slot] === id);
    const broken = count(profile.brokenCount);
    return {broken, repaired:count(profile.repairedCount), owned, equipped, nicknamePurchases:count(profile.wallet?.nicknamePurchases)};
  }
  function apply(value, direction) {
    totals.accounts += direction;
    totals.brokenAccounts += (value.broken > 0 ? 1 : 0) * direction;
    totals.totalBroken += value.broken * direction;
    totals.totalRepaired += value.repaired * direction;
    totals.buyers += (value.owned.length > 0 ? 1 : 0) * direction;
    totals.paidCopies += value.owned.length * direction;
    totals.nicknamePurchases += value.nicknamePurchases * direction;
    for (const id of value.owned) {
      rows.get(id).owned += direction;
      totals.priceValue += paid.get(id).price * direction;
    }
    for (const id of value.equipped) rows.get(id).equipped += direction;
  }
  function remove(id) {
    const previous = contributions.get(id);
    if (!previous) return;
    apply(previous, -1);
    contributions.delete(id);
  }
  return {
    observe(profile) {
      if (!profile || typeof profile.id !== 'string' || !profile.id.startsWith('visitor:') || excluded.has(profile.id)) return;
      const next = contribution(profile);
      remove(profile.id);
      contributions.set(profile.id, next);
      apply(next, 1);
    },
    remove,
    snapshot() {
      return {...totals, items:[...rows.values()].map(row => ({...row})).sort((a,b) => a.price-b.price || a.id.localeCompare(b.id))};
    }
  };
}
