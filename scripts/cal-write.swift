import EventKit
import Foundation

struct Cmd: Codable {
    var action: String        // "create"
    var title: String
    var start: String
    var end: String?
    var isAllDay: Bool?
    var location: String?
    var notes: String?
    var calendarId: String?
}

struct Result: Codable {
    var ok: Bool
    var eventId: String?
    var error: String?
}

let encoder = JSONEncoder()

func respond(_ r: Result) {
    if let data = try? encoder.encode(r), let s = String(data: data, encoding: .utf8) {
        print(s); fflush(stdout)
    }
}

let input = FileHandle.standardInput.readDataToEndOfFile()
guard let cmd = try? JSONDecoder().decode(Cmd.self, from: input) else {
    respond(Result(ok: false, error: "invalid JSON")); exit(1)
}

let store = EKEventStore()

let iso: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()

func doCreate() {
    guard let startDate = iso.date(from: cmd.start) else {
        respond(Result(ok: false, error: "bad start date")); exit(1)
    }
    let endDate = cmd.end.flatMap { iso.date(from: $0) }
                  ?? startDate.addingTimeInterval(3600)

    let ev = EKEvent(eventStore: store)
    ev.title    = cmd.title
    ev.startDate = startDate
    ev.endDate   = endDate
    ev.isAllDay  = cmd.isAllDay ?? false
    ev.location  = cmd.location
    ev.notes     = cmd.notes
    ev.calendar  = cmd.calendarId.flatMap { store.calendar(withIdentifier: $0) }
                   ?? store.defaultCalendarForNewEvents

    do {
        try store.save(ev, span: .thisEvent, commit: true)
        respond(Result(ok: true, eventId: ev.eventIdentifier))
    } catch {
        respond(Result(ok: false, error: error.localizedDescription))
    }
    exit(0)
}

func requestAccess(_ done: @escaping (Bool) -> Void) {
    if #available(macOS 14.0, *) {
        store.requestFullAccessToEvents { ok, _ in DispatchQueue.main.async { done(ok) } }
    } else {
        store.requestAccess(to: .event) { ok, _ in DispatchQueue.main.async { done(ok) } }
    }
}

requestAccess { granted in
    guard granted else {
        respond(Result(ok: false, error: "access denied")); exit(1)
    }
    switch cmd.action {
    case "create": doCreate()
    default: respond(Result(ok: false, error: "unknown action")); exit(1)
    }
}

RunLoop.main.run()
