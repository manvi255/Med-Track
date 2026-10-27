const dateFormatterCache = new Map();

export function isValidTimeZone(timezone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function getFormatter(timezone) {
  if (!dateFormatterCache.has(timezone)) {
    dateFormatterCache.set(timezone, new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }));
  }
  return dateFormatterCache.get(timezone);
}

export function getLocalDateParts(timestamp, timezone) {
  const parts = getFormatter(timezone).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  };
}

export function localDateString(timestamp, timezone) {
  const { year, month, day } = getLocalDateParts(timestamp, timezone);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function startOfLocalDayUtc(dateString, timezone) {
  const midnight = resolveLocalDateTime(dateString, "00:00", timezone);
  if (midnight) return midnight;

  const [year, month, day] = dateString.split("-").map(Number);
  const nominalUtc = Date.UTC(year, month - 1, day);
  const searchStart = nominalUtc - 36 * 60 * 60 * 1000;
  const searchEnd = nominalUtc + 36 * 60 * 60 * 1000;
  const step = 60 * 1000;
  let previous = searchStart;
  for (let timestamp = searchStart; timestamp <= searchEnd; timestamp += step) {
    if (localDateString(timestamp, timezone) !== dateString) {
      previous = timestamp;
      continue;
    }

    let low = previous;
    let high = timestamp;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (localDateString(middle, timezone) === dateString) high = middle;
      else low = middle;
    }
    return new Date(high);
  }
  throw new RangeError("Unable to resolve local calendar day in timezone");
}

export function addCalendarDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function dateOnlyString(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function getOffsetAt(timestamp, timezone) {
  const parts = getLocalDateParts(timestamp, timezone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - Math.floor(timestamp / 1000) * 1000;
}

export function resolveLocalDateTime(dateString, timeString, timezone) {
  if (!isValidTimeZone(timezone)) {
    throw new RangeError("Invalid IANA timezone");
  }
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = timeString.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 6) {
    offsets.add(getOffsetAt(localAsUtc + hours * 60 * 60 * 1000, timezone));
  }

  const candidates = [...offsets]
    .map((offset) => localAsUtc - offset)
    .filter((timestamp) => {
      const local = getLocalDateParts(timestamp, timezone);
      return local.year === year
        && local.month === month
        && local.day === day
        && local.hour === hour
        && local.minute === minute
        && local.second === 0;
    })
    .sort((left, right) => left - right);

  // During a fall-back overlap, choose the earlier occurrence; nonexistent spring-forward times are skipped.
  return candidates.length ? new Date(candidates[0]) : null;
}

export function getLocalWeekday(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
