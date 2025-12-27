/**
 * ICS (iCalendar) Parser
 *
 * Parses ICS files from Google Calendar and other calendar providers.
 */

/**
 * Parsed calendar event
 */
export interface ParsedEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate?: Date;
  isAllDay: boolean;
  isRecurring: boolean;
  recurrenceRule?: string;
}

/**
 * Parse ICS content into events
 */
export function parseICS(content: string): ParsedEvent[] {
  const events: ParsedEvent[] = [];

  // Unfold lines (lines starting with space/tab are continuations)
  const unfoldedContent = unfoldLines(content);
  const lines = unfoldedContent.split('\n');

  let currentEvent: Partial<ParsedEvent> | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine === 'BEGIN:VEVENT') {
      currentEvent = {};
      continue;
    }

    if (trimmedLine === 'END:VEVENT') {
      if (currentEvent && currentEvent.uid && currentEvent.summary && currentEvent.startDate) {
        events.push(currentEvent as ParsedEvent);
      }
      currentEvent = null;
      continue;
    }

    if (!currentEvent) continue;

    // Parse property
    const colonIndex = trimmedLine.indexOf(':');
    if (colonIndex === -1) continue;

    const propertyPart = trimmedLine.substring(0, colonIndex);
    const valuePart = trimmedLine.substring(colonIndex + 1);

    // Handle property with parameters (e.g., DTSTART;VALUE=DATE:20240101)
    const semicolonIndex = propertyPart.indexOf(';');
    const propertyName = semicolonIndex === -1
      ? propertyPart
      : propertyPart.substring(0, semicolonIndex);
    const propertyParams = semicolonIndex === -1
      ? ''
      : propertyPart.substring(semicolonIndex + 1);

    switch (propertyName) {
      case 'UID':
        currentEvent.uid = valuePart;
        break;

      case 'SUMMARY':
        currentEvent.summary = unescapeICSValue(valuePart);
        break;

      case 'DESCRIPTION':
        currentEvent.description = unescapeICSValue(valuePart);
        break;

      case 'LOCATION':
        currentEvent.location = unescapeICSValue(valuePart);
        break;

      case 'DTSTART':
        const startResult = parseICSDate(valuePart, propertyParams);
        currentEvent.startDate = startResult.date;
        currentEvent.isAllDay = startResult.isAllDay;
        break;

      case 'DTEND':
        const endResult = parseICSDate(valuePart, propertyParams);
        currentEvent.endDate = endResult.date;
        break;

      case 'RRULE':
        currentEvent.isRecurring = true;
        currentEvent.recurrenceRule = valuePart;
        break;
    }
  }

  return events;
}

/**
 * Unfold ICS lines (continuation lines start with space or tab)
 */
function unfoldLines(content: string): string {
  // Replace CRLF + space/tab with empty string (unfold)
  return content
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '');
}

/**
 * Unescape ICS text values
 */
function unescapeICSValue(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Parse ICS date/datetime value
 */
function parseICSDate(value: string, params: string): { date: Date; isAllDay: boolean } {
  const isAllDay = params.includes('VALUE=DATE') && !params.includes('VALUE=DATE-TIME');

  if (isAllDay) {
    // Format: YYYYMMDD
    const year = parseInt(value.substring(0, 4), 10);
    const month = parseInt(value.substring(4, 6), 10) - 1;
    const day = parseInt(value.substring(6, 8), 10);
    return { date: new Date(year, month, day), isAllDay: true };
  }

  // Format: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  const year = parseInt(value.substring(0, 4), 10);
  const month = parseInt(value.substring(4, 6), 10) - 1;
  const day = parseInt(value.substring(6, 8), 10);

  if (value.length >= 15) {
    const hour = parseInt(value.substring(9, 11), 10);
    const minute = parseInt(value.substring(11, 13), 10);
    const second = parseInt(value.substring(13, 15), 10);

    if (value.endsWith('Z')) {
      // UTC time
      return { date: new Date(Date.UTC(year, month, day, hour, minute, second)), isAllDay: false };
    } else {
      // Local time
      return { date: new Date(year, month, day, hour, minute, second), isAllDay: false };
    }
  }

  return { date: new Date(year, month, day), isAllDay: true };
}

/**
 * Check if event is a yearly recurring event (birthday/anniversary)
 */
export function isYearlyRecurring(event: ParsedEvent): boolean {
  return event.isRecurring &&
         event.recurrenceRule !== undefined &&
         event.recurrenceRule.includes('FREQ=YEARLY');
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format time as HH:MM
 */
export function formatTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Sanitize filename (remove invalid characters)
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100); // Limit length
}
