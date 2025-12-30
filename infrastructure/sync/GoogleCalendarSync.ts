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
  eventsDeleted: number;
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
      eventsDeleted: 0,
      errors: [],
    };

    try {
      // Fetch ICS content
      const icsContent = await this.fetchICS(config.url);
      if (!icsContent) {
        result.errors.push('Failed to fetch calendar data');
        return result;
      }

      // Parse events (async to prevent UI blocking)
      const events = await parseICS(icsContent);

      // Build set of current event UIDs for orphan detection
      const currentUIDs = new Set(events.map(e => e.uid));

      // Ensure target folder exists
      await this.ensureFolder(config.folder);

      // Process events in batches to prevent UI blocking
      const BATCH_SIZE = 20;
      for (let i = 0; i < events.length; i += BATCH_SIZE) {
        const batch = events.slice(i, i + BATCH_SIZE);

        for (const event of batch) {
          try {
            const eventResult = await this.processEvent(event, config);
            if (eventResult === 'created') result.eventsCreated++;
            else if (eventResult === 'updated') result.eventsUpdated++;
            else result.eventsSkipped++;
          } catch (e) {
            result.errors.push(`Event "${event.summary}": ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        // Yield to main thread after each batch to keep UI responsive
        if (i + BATCH_SIZE < events.length) {
          await this.yieldToMainThread();
        }
      }

      // Detect and move orphaned notes (deleted in Google)
      const deletedCount = await this.handleOrphanedNotes(config.folder, currentUIDs);
      result.eventsDeleted = deletedCount;

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
   * Yield to main thread to keep UI responsive
   * Uses setTimeout(0) to allow pending UI events to process
   */
  private yieldToMainThread(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  /**
   * Handle orphaned notes (events deleted from Google Calendar)
   * Moves them to a .deleted subfolder instead of permanent deletion
   */
  private async handleOrphanedNotes(folderPath: string, currentUIDs: Set<string>): Promise<number> {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return 0;

    let deletedCount = 0;
    const deletedFolderPath = `${folderPath}/.deleted`;

    // Get all markdown files in the folder (not in .deleted)
    const files = folder.children.filter(
      (f): f is TFile => f instanceof TFile && f.extension === 'md'
    );

    for (const file of files) {
      try {
        const content = await this.app.vault.read(file);

        // Extract gcal-uid from frontmatter
        const uidMatch = content.match(/gcal-uid:\s*"([^"]+)"/);
        if (!uidMatch) continue; // Not a Google Calendar note

        const uid = uidMatch[1];

        // Check if this event still exists in Google Calendar
        if (!currentUIDs.has(uid)) {
          // Event deleted from Google - move to .deleted folder
          await this.ensureFolder(deletedFolderPath);
          const newPath = `${deletedFolderPath}/${file.name}`;

          // Check if destination exists and rename if needed
          let finalPath = newPath;
          let counter = 1;
          while (this.app.vault.getAbstractFileByPath(finalPath)) {
            const baseName = file.basename;
            finalPath = `${deletedFolderPath}/${baseName}_${counter}.md`;
            counter++;
          }

          await this.app.vault.rename(file, finalPath);
          deletedCount++;
        }
      } catch (e) {
        console.error(`Failed to check orphan status for ${file.path}:`, e);
      }
    }

    return deletedCount;
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
   * Process a single event with differential sync
   * Only updates if sequence number changed (event was modified in Google)
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

    if (existingFile instanceof TFile) {
      // Differential sync: compare sequence number
      const existingContent = await this.app.vault.read(existingFile);

      // Extract existing sequence from frontmatter
      const sequenceMatch = existingContent.match(/gcal-sequence:\s*(\d+)/);
      const existingSequence = sequenceMatch ? parseInt(sequenceMatch[1], 10) : -1;

      // Skip if sequence hasn't changed (event not modified in Google)
      if (event.sequence !== undefined && existingSequence === event.sequence) {
        return 'skipped';
      }

      // Sequence changed or not set - update the file
      const content = this.generateFileContent(event, config);
      await this.app.vault.modify(existingFile, content);
      return 'updated';
    }

    // Create new file
    const content = this.generateFileContent(event, config);
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

    // Google Calendar metadata for differential sync
    lines.push(`gcal-uid: "${event.uid}"`);
    lines.push(`gcal-source: "${config.name}"`);
    if (event.sequence !== undefined) {
      lines.push(`gcal-sequence: ${event.sequence}`);
    }
    if (event.lastModified) {
      lines.push(`gcal-last-modified: "${event.lastModified}"`);
    }

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

    // Description (sanitized to remove HTML)
    if (event.description) {
      lines.push('## Beschreibung');
      lines.push('');
      lines.push(sanitizeDescription(event.description));
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * Sanitize HTML content from calendar descriptions
 * Strips HTML tags while preserving basic text formatting
 */
function sanitizeDescription(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')     // <br> → Newline
    .replace(/<\/p>/gi, '\n\n')        // </p> → Paragraph break
    .replace(/<\/li>/gi, '\n')         // </li> → Newline
    .replace(/<li>/gi, '- ')           // <li> → List item
    .replace(/<[^>]*>/g, '')           // Remove all other HTML tags
    .replace(/&nbsp;/g, ' ')           // HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')        // Collapse multiple newlines
    .trim();
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
    showSpanningArcs: true,
  };
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `gcal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
