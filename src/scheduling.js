function nextWeekly(date, dayOfWeek, hour, intervalWeeks = 1) {
  const next = new Date(date.getTime());
  next.setHours(hour, 0, 0, 0);
  const delta = (dayOfWeek - next.getDay() + 7) % 7;
  if (delta === 0 && next <= date) {
    next.setDate(next.getDate() + 7 * intervalWeeks);
    return next;
  }
  next.setDate(next.getDate() + delta);
  if (next <= date) next.setDate(next.getDate() + 7 * intervalWeeks);
  return next;
}

function nextMonthly(date, dayOfMonth, hour) {
  const next = new Date(date.getTime());
  next.setHours(hour, 0, 0, 0);
  next.setDate(dayOfMonth);
  if (next <= date) {
    next.setMonth(next.getMonth() + 1);
    next.setDate(dayOfMonth);
  }
  return next;
}

export function computeNextRun(schedule, fromDate = new Date()) {
  if (!schedule || schedule.frequency === 'none') return null;
  const dayOfWeek = Number(schedule.dayOfWeek ?? 1);
  const dayOfMonth = Number(schedule.dayOfMonth ?? 1);
  const hour = Number(schedule.hour ?? 9);

  if (schedule.frequency === 'weekly') {
    return nextWeekly(fromDate, dayOfWeek, hour, 1);
  }
  if (schedule.frequency === 'biweekly') {
    return nextWeekly(fromDate, dayOfWeek, hour, 2);
  }
  if (schedule.frequency === 'monthly') {
    return nextMonthly(fromDate, dayOfMonth, hour);
  }
  return null;
}

export function isDue(schedule, nextRunAt) {
  if (!schedule || schedule.frequency === 'none') return false;
  if (!nextRunAt) return true;
  return new Date(nextRunAt) <= new Date();
}
