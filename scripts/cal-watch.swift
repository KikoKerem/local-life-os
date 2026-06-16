import EventKit
import Foundation

// ── Shared types ───────────────────────────────────────────────────────────

struct EventJSON: Codable {
    var id: String
    var title: String
    var start: String
    var end: String
    var isAllDay: Bool
    var location: String?
    var notes: String?
    var calendarName: String
    var calendarColor: String
    var calendarId: String
}

struct Message: Codable {
    var type: String
    var events: [EventJSON]
}

let store = EKEventStore()
let encoder = JSONEncoder()

let iso: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
}()

func hexColor(_ c: CGColor?) -> String {
    guard let c = c,
          let rgb = c.converted(to: CGColorSpace(name: CGColorSpace.sRGB)!,
                                intent: .defaultIntent, options: nil),
          let k = rgb.components, k.count >= 3
    else { return "#4a9eff" }
    return String(format: "#%02x%02x%02x", Int(k[0]*255), Int(k[1]*255), Int(k[2]*255))
}

func toJSON(_ e: EKEvent) -> EventJSON {
    EventJSON(
        id: e.eventIdentifier ?? UUID().uuidString,
        title: e.title ?? "(no title)",
        start: iso.string(from: e.startDate ?? Date()),
        end: iso.string(from: e.endDate ?? Date()),
        isAllDay: e.isAllDay,
        location: e.location,
        notes: e.notes,
        calendarName: e.calendar?.title ?? "Calendar",
        calendarColor: hexColor(e.calendar?.cgColor),
        calendarId: e.calendar?.calendarIdentifier ?? ""
    )
}

func requestAccess(_ done: @escaping (Bool) -> Void) {
    if #available(macOS 14.0, *) {
        store.requestFullAccessToEvents { ok, _ in DispatchQueue.main.async { done(ok) } }
    } else {
        store.requestAccess(to: .event) { ok, _ in DispatchQueue.main.async { done(ok) } }
    }
}

func emit(_ type: String, _ events: [EventJSON]) {
    guard !events.isEmpty else { return }
    if let data = try? encoder.encode(Message(type: type, events: events)),
       let s = String(data: data, encoding: .utf8) { print(s); fflush(stdout) }
}

// ── List mode (--list --from ISO --to ISO) ─────────────────────────────────

let args = CommandLine.arguments
if args.contains("--list") {
    func argVal(_ flag: String) -> String? {
        guard let i = args.firstIndex(of: flag), i + 1 < args.count else { return nil }
        return args[i + 1]
    }
    let fromStr = argVal("--from") ?? ""
    let toStr   = argVal("--to")   ?? ""
    guard let fromDate = iso.date(from: fromStr), let toDate = iso.date(from: toStr) else {
        fputs("{\"error\":\"bad --from / --to\"}\n", stderr); exit(1)
    }
    requestAccess { granted in
        guard granted else { fputs("{\"error\":\"access denied\"}\n", stderr); exit(1) }
        let pred = store.predicateForEvents(withStart: fromDate, end: toDate, calendars: nil)
        let evs  = store.events(matching: pred).map(toJSON)
        if let data = try? encoder.encode(evs), let s = String(data: data, encoding: .utf8) {
            print(s); fflush(stdout)
        }
        exit(0)
    }
    RunLoop.main.run()
    exit(0)
}

// ── Watch mode (default) ───────────────────────────────────────────────────

let lookback: TimeInterval  = 180 * 86400
let lookahead: TimeInterval = 365 * 86400
var snapshot: [String: EventJSON] = [:]

func fetchAll() -> [String: EventJSON] {
    let now = Date()
    let pred = store.predicateForEvents(
        withStart: now.addingTimeInterval(-lookback),
        end:       now.addingTimeInterval(lookahead),
        calendars: nil
    )
    var out: [String: EventJSON] = [:]
    for e in store.events(matching: pred) {
        if let id = e.eventIdentifier { out[id] = toJSON(e) }
    }
    return out
}

func diff(old: [String: EventJSON], new curr: [String: EventJSON]) {
    var added: [EventJSON] = [], modified: [EventJSON] = [], deleted: [EventJSON] = []
    for (id, ev) in curr {
        guard let prev = old[id] else { added.append(ev); continue }
        if prev.title != ev.title || prev.start != ev.start ||
           prev.end != ev.end || prev.location != ev.location { modified.append(ev) }
    }
    for (id, ev) in old where curr[id] == nil { deleted.append(ev) }
    emit("added", added); emit("modified", modified); emit("deleted", deleted)
}

func setup() {
    snapshot = fetchAll()
    emit("snapshot", Array(snapshot.values))
    NotificationCenter.default.addObserver(
        forName: .EKEventStoreChanged, object: store, queue: .main
    ) { _ in
        let curr = fetchAll()
        diff(old: snapshot, new: curr)
        snapshot = curr
    }
}

requestAccess { granted in
    guard granted else { fputs("{\"error\":\"access denied\"}\n", stderr); exit(1) }
    setup()
}

RunLoop.main.run()
