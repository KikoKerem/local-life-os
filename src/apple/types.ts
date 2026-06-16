export interface AppleCalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location: string | null;
  notes: string | null;
  calendarName: string;
  calendarColor: string;
  calendarId: string;
}

export interface PendingChange {
  changeId: string;
  type: 'added' | 'modified' | 'deleted';
  event: AppleCalEvent;
  seenAt: string;
}
