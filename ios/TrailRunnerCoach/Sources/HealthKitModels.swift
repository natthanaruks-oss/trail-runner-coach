import Foundation

struct HealthSyncPayload: Encodable {
    let schemaVersion: Int
    let source: String
    let requestId: String
    let exportedAt: Date
    let range: SyncRange
    let dailyMetrics: [DailyHealthMetric]
    let activities: [HealthActivity]
    let bodyComposition: [HealthBodyComposition]
}

struct SyncRange: Encodable {
    let startDate: String
    let endDate: String
    let days: Int
}

struct DailyHealthMetric: Encodable {
    let date: String
    let sleepHours: Double?
    let restingHr: Double?
    let hrvMs: Double?
    let activeEnergyKcal: Double?
    let steps: Double?
    let exerciseMinutes: Double?
    let walkingRunningDistanceKm: Double?
    let sourceDevice: String?
    let sourceBundle: String?
}

struct HealthActivity: Encodable {
    let externalId: String
    let uuid: String
    let date: String
    let startTime: Date
    let endTime: Date
    let name: String
    let type: String
    let durationMin: Double
    let distanceKm: Double?
    let elevationGainM: Double?
    let elevationLossM: Double?
    let avgHr: Double?
    let maxHr: Double?
    let activeEnergyKcal: Double?
    let rpe: Double?
    let terrain: String
    let isNight: Bool
    let sourceDevice: String?
    let sourceBundle: String?
}

struct HealthBodyComposition: Encodable {
    let id: String
    let date: String
    let measuredAt: Date?
    let weightKg: Double?
    let percentBodyFat: Double?
    let leanBodyMassKg: Double?
    let heightCm: Double?
    let sourceDevice: String?
}
