/**
 * scheduleProjector.js — the schedule is a PROJECTION of the strategy, never a planner (ADR-057).
 *
 * Pure + deterministic. Given the strategy's ordered, calendar-agnostic `roadmap` (from
 * planningEngine.buildStrategy) it mechanically bin-packs the work across the available study days into the
 * existing `block.days[].tasks[]` shape the Planner UI renders. It makes ZERO planning decisions — no
 * priorities, no topic selection, no revision/mock choices. Change the strategy → re-project → new schedule.
 *
 * `project(roadmap, opts)` →  { startDate, endDate, days: [...] }
 *   opts: { startDate:'YYYY-MM-DD', horizonDays=14, dailyMinutes=45, daysPerWeek=6, restDows?:[dow], workload }
 */
'use strict';

var DAY = 86400000;
// which weekdays become rest days first as daysPerWeek drops (Sun, Sat, Wed, Fri, Tue, Thu, Mon)
var REST_PRIORITY = [0, 6, 3, 5, 2, 4, 1];

function _iso(d) { return d.getFullYear() + '-' + _p(d.getMonth() + 1) + '-' + _p(d.getDate()); }
function _p(n) { return (n < 10 ? '0' : '') + n; }
function _parse(iso) { var t = new Date((iso || '') + 'T00:00:00'); return isNaN(t.getTime()) ? new Date() : t; }
function _difficultyLabel(d) { d = Number(d) || 0.5; return d < 0.4 ? 'easy' : d < 0.66 ? 'medium' : 'hard'; }
function _blockKind(action) { return action === 'mock' ? 'mock' : action === 'learn' ? 'learn' : 'revise'; }

/** The set of rest weekdays implied by daysPerWeek (deterministic), unless caller pins restDows. */
function _restDows(daysPerWeek, restDows) {
  if (restDows && restDows.length) { var s = {}; restDows.forEach(function (d) { s[d] = 1; }); return s; }
  var rest = Math.max(0, 7 - Math.max(1, Math.min(7, daysPerWeek))), out = {};
  for (var i = 0; i < rest; i++) out[REST_PRIORITY[i]] = 1;
  return out;
}

function _task(item) {
  return { topicId: item.topicId, label: item.label, section: item.section || '',
    estMin: Math.max(5, Math.round((Number(item.hours) || 0.5) * 60)), priority: 1000 - (Number(item.order) || 0),
    difficulty: _difficultyLabel(item.difficulty), drillable: item.drillable || null,
    kind: _blockKind(item.action), reason: item.reason || '', done: false, completedAt: null, result: null };
}

function project(roadmap, opts) {
  opts = opts || {};
  roadmap = (roadmap || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  var horizon = Math.max(1, opts.horizonDays || 14);
  var daily = Math.max(10, Number(opts.dailyMinutes) || 45);
  if (opts.workload === 'light') daily = Math.round(daily * 0.7);   // burnout → lighter near-term load (Profile signal)
  var restSet = _restDows(opts.daysPerWeek || 6, opts.restDows);
  var start = _parse(opts.startDate || _iso(new Date()));

  var days = [], idx = 0;
  for (var i = 0; i < horizon; i++) {
    var d = new Date(start.getTime() + i * DAY), dow = d.getDay();
    if (restSet[dow]) { days.push({ date: _iso(d), dow: dow, kind: 'rest', tasks: [] }); continue; }
    var tasks = [], used = 0;
    // fill this study day from the roadmap, in order, until the time budget is spent (never split a topic;
    // always place at least one task so a day is never wastefully empty while work remains).
    while (idx < roadmap.length) {
      var item = roadmap[idx], est = Math.max(5, Math.round((Number(item.hours) || 0.5) * 60));
      if (tasks.length && used + est > daily) break;
      tasks.push(_task(item)); used += est; idx++;
    }
    days.push({ date: _iso(d), dow: dow, kind: 'study', tasks: tasks });
  }
  return { startDate: _iso(start), endDate: _iso(new Date(start.getTime() + (horizon - 1) * DAY)), days: days };
}

module.exports = { project: project };
