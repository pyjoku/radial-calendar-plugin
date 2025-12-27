/**
 * Google Calendar Sync Service
 *
 * Fetches and syncs Google Calendar events to Obsidian notes.
 */

import { App, TFile, TFolder, Notice, requestUrl } from 'obsidian';
import {
  parseICS,
  ParsedEvent,
  isYearlyRecurring,
  formatDateISO,
  formatTime,
  sanitizeFilename,
} from '../parsers/ICSParser';
import type { CalendarSourceConfig } from '../../core/domain/types';

/**
 * Sync result
 */
export interface SyncResult {
  success: boolean;
  calendarId: string;
  calendarName: string;
  eventsCreated: number;
  eventsUpdated: number;
  eventsSkipped: number;
  errors: string[];
}

/**
 * Google Calendar Sync Service
 */
export class GoogleCalendarSync {
  private syncIntervals: Map<string, number> = new Map();

  constructor(private readonly app: App) {}

  /**
   * Sync a single calendar source
   */
  async syncCalendar(config: CalendarSourceConfig): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      calendarId: config.id,
      calendarName: config.name,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsSkipped: 0,
      errors: [],
    };

    try {
      // Fetch ICS content
      const icsContent = await this.fetchICS(config.url);
      if (!icsContent) {
        result.errors.push('Failed to fetch calendar data');
        return result;
      }

      // Parse events
      const events = parseICS(icsContent);

      // Ensure target folder exists
      await this.ensureFolder(config.folder);

      // Process each event
      for (const event of events) {
        try {
          const eventResult = await this.processEvent(event, config);
          if (eventResult === 'created') result.eventsCreated++;
          else if (eventResult === 'updated') result.eventsUpdated++;
          else result.eventsSkipped++;
        } catch (e) {
          result.errors.push(`Event "${event.summary}": ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      result.success = true;
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : String(e));
    }

    return result;
  }

  /**
   * Sync all enabled calendars
   */
  async syncAllCalendars(configs: CalendarSourceConfig[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    for (const config of configs) {
      if (config.enabled) {
        const result = await this.syncCalendar(config);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Start auto-sync intervals for calendars
   */
  startAutoSync(
    configs: CalendarSourceConfig[],
    onSync: (result: SyncResult) => void
  ): void {
    // Clear existing intervals
    this.stopAutoSync();

    for (const config of configs) {
      if (config.enabled && config.syncIntervalMinutes > 0) {
        const intervalMs = config.syncIntervalMinutes * 60 * 1000;
        const intervalId = window.setInterval(async () => {
          const result = await this.syncCalendar(config);
          onSync(result);
        }, intervalMs);

        this.syncIntervals.set(config.id, intervalId);
      }
    }
  }

  /**
   * Stop all auto-sync intervals
   */
  stopAutoSync(): void {
    for (const intervalId of this.syncIntervals.values()) {
      window.clearInterval(intervalId);
    }
    this.syncIntervals.clear();
  }

  /**
   * Fetch ICS content from URL
   */
  private async fetchICS(url: string): Promise<string | null> {
    try {
      const response = await requestUrl({
        url,
        method: 'GET',
      });

      if (response.status === 200) {
        return response.text;
      }

      return null;
    } catch (e) {
      console.error('Failed to fetch ICS:', e);
      return null;
    }
  }

  /**
   * Ensure folder exists, create if necessary
   */
  private async ensureFolder(folderPath: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (folder instanceof TFolder) return;

    // Create folder and parents
    const parts = folderPath.split('/');
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(currentPath);
      if (!existing) {
        await this.app.vault.createFolder(currentPath);
      }
    }
  }

  /**
   * Process a single event
   */
  private async processEvent(
    event: ParsedEvent,
    config: CalendarSourceConfig
  ): Promise<'created' | 'updated' | 'skipped'> {
    // Generate filename from event
    const filename = this.generateFilename(event);
    const filePath = `${config.folder}/${filename}.md`;

    // Check if file exists
    const existingFile = this.app.vault.getAbstractFileByPath(filePath);

    // Generate file content
    const content = this.generateFileContent(event, config);

    if (existingFile instanceof TFile) {
      // Check if content changed (by comparing UID in frontmatter)
      const existingContent = await this.app.vault.read(existingFile);
      if (existingContent.includes(`gcal-uid: "${event.uid}"`)) {
        // Same event, check if update needed
        const existingMtime = existingFile.stat.mtime;
        // Skip if file was modified recently (within 1 hour) - user may have edited
        if (Date.now() - existingMtime < 60 * 60 * 1000) {
          return 'skipped';
        }
      }

      await this.app.vault.modify(existingFile, content);
      return 'updated';
    }

    // Create new file
    await this.app.vault.create(filePath, content);
    return 'created';
  }

  /**
   * Generate filename for event
   */
  private generateFilename(event: ParsedEvent): string {
    const dateStr = formatDateISO(event.startDate);
    const title = sanitizeFilename(event.summary);
    return `${dateStr} ${title}`;
  }

  /**
   * Generate markdown file content
   */
  private generateFileContent(event: ParsedEvent, config: CalendarSourceConfig): string {
    const lines: string[] = ['---'];

    // Frontmatter
    lines.push(`radcal-start: ${formatDateISO(event.startDate)}`);

    if (event.endDate) {
      lines.push(`radcal-end: ${formatDateISO(event.endDate)}`);
    }

    lines.push(`radcal-color: ${config.color}`);
    lines.push(`radcal-label: "${event.summary.replace(/"/g, '\\"')}"`);

    // Google Calendar metadata
    lines.push(`gcal-uid: "${event.uid}"`);
    lines.push(`gcal-source: "${config.name}"`);

    if (event.isRecurring) {
      lines.push(`gcal-recurring: true`);
      if (isYearlyRecurring(event)) {
        lines.push(`anniversary: true`);
      }
    }

    if (event.location) {
      lines.push(`location: "${event.location.replace(/"/g, '\\"')}"`);
    }

    lines.push('---');
    lines.push('');

    // Title
    lines.push(`# ${event.summary}`);
    lines.push('');

    // Time info
    if (!event.isAllDay) {
      const startTime = formatTime(event.startDate);
      if (event.endDate) {
        const endTime = formatTime(event.endDate);
        lines.push(`**Zeit:** ${startTime} - ${endTime}`);
      } else {
        lines.push(`**Zeit:** ${startTime}`);
      }
      lines.push('');
    }

    // Location
    if (event.location) {
      lines.push(`**Ort:** ${event.location}`);
      lines.push('');
    }

    // Description
    if (event.description) {
      lines.push('## Beschreibung');
      lines.push('');
      lines.push(event.description);
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * Default calendar source configuration
 */
export function createDefaultCalendarSource(): CalendarSourceConfig {
  return {
    id: generateId(),
    name: 'Google Calendar',
    url: '',
    folder: 'Calendar/Google',
    color: 'blue',
    syncOnStart: true,
    syncIntervalMinutes: 0,
    enabled: true,
    showAsRing: true,
  };
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `gcal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
