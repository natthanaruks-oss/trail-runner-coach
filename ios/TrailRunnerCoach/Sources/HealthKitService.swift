import Foundation
import HealthKit

@MainActor
final class HealthKitService {
    private let store = HKHealthStore()
    private let calendar = Calendar.autoupdatingCurrent

    private var workoutType: HKWorkoutType { HKObjectType.workoutType() }
    private var sleepType: HKCategoryType { HKObjectType.categoryType(forIdentifier: .sleepAnalysis)! }
    private var restingHeartRateType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .restingHeartRate)! }
    private var heartRateVariabilityType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)! }
    private var heartRateType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .heartRate)! }
    private var activeEnergyType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)! }
    private var stepCountType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .stepCount)! }
    private var distanceType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)! }
    private var exerciseTimeType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .appleExerciseTime)! }
    private var bodyMassType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .bodyMass)! }
    private var bodyFatType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .bodyFatPercentage)! }
    private var leanBodyMassType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .leanBodyMass)! }
    private var heightType: HKQuantityType { HKObjectType.quantityType(forIdentifier: .height)! }

    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw HealthBridgeError.healthDataUnavailable
        }
        let readTypes: Set<HKObjectType> = [
            workoutType,
            sleepType,
            restingHeartRateType,
            heartRateVariabilityType,
            heartRateType,
            activeEnergyType,
            stepCountType,
            distanceType,
            exerciseTimeType,
            bodyMassType,
            bodyFatType,
            leanBodyMassType,
            heightType
        ]
        try await store.requestAuthorization(toShare: [], read: readTypes)
    }

    func makeSyncPayload(days: Int, requestID: String) async throws -> HealthSyncPayload {
        let end = Date()
        let start = calendar.date(byAdding: .day, value: -(days - 1), to: calendar.startOfDay(for: end)) ?? end
        async let metrics = fetchDailyMetrics(from: start, to: end)
        async let workouts = fetchWorkouts(from: start, to: end)
        async let body = fetchBodyComposition()
        let (dailyMetrics, activities, bodyComposition) = try await (metrics, workouts, body)

        return HealthSyncPayload(
            schemaVersion: 1,
            source: "apple_health",
            requestId: requestID,
            exportedAt: Date(),
            range: SyncRange(
                startDate: dayKey(start),
                endDate: dayKey(end),
                days: days
            ),
            dailyMetrics: dailyMetrics,
            activities: activities,
            bodyComposition: bodyComposition
        )
    }

    private func fetchDailyMetrics(from start: Date, to end: Date) async throws -> [DailyHealthMetric] {
        var rows: [DailyHealthMetric] = []
        var day = calendar.startOfDay(for: start)
        let finalDay = calendar.startOfDay(for: end)

        while day <= finalDay {
            guard let nextDay = calendar.date(byAdding: .day, value: 1, to: day) else { break }
            async let sleep = sleepHours(from: day, to: nextDay)
            async let rhr = averageQuantity(restingHeartRateType, unit: HKUnit.count().unitDivided(by: .minute()), from: day, to: nextDay)
            async let hrv = averageQuantity(heartRateVariabilityType, unit: .secondUnit(with: .milli), from: day, to: nextDay)
            async let energy = cumulativeQuantity(activeEnergyType, unit: .kilocalorie(), from: day, to: nextDay)
            async let steps = cumulativeQuantity(stepCountType, unit: .count(), from: day, to: nextDay)
            async let exercise = cumulativeQuantity(exerciseTimeType, unit: .minute(), from: day, to: nextDay)
            async let distance = cumulativeQuantity(distanceType, unit: .meterUnit(with: .kilo), from: day, to: nextDay)

            let values = try await (sleep, rhr, hrv, energy, steps, exercise, distance)
            if values.0 != nil || values.1 != nil || values.2 != nil || values.3 != nil || values.4 != nil || values.5 != nil || values.6 != nil {
                rows.append(DailyHealthMetric(
                    date: dayKey(day),
                    sleepHours: rounded(values.0, digits: 2),
                    restingHr: rounded(values.1, digits: 1),
                    hrvMs: rounded(values.2, digits: 1),
                    activeEnergyKcal: rounded(values.3, digits: 1),
                    steps: rounded(values.4, digits: 0),
                    exerciseMinutes: rounded(values.5, digits: 1),
                    walkingRunningDistanceKm: rounded(values.6, digits: 2),
                    sourceDevice: nil,
                    sourceBundle: nil
                ))
            }
            day = nextDay
        }
        return rows
    }

    private func fetchWorkouts(from start: Date, to end: Date) async throws -> [HealthActivity] {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [.strictStartDate])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let workouts: [HKWorkout] = try await samples(type: workoutType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort])
        var activities: [HealthActivity] = []
        activities.reserveCapacity(workouts.count)

        for workout in workouts {
            let distance = workout.statistics(for: distanceType)?.sumQuantity()?.doubleValue(for: .meterUnit(with: .kilo))
            let activeEnergy = workout.statistics(for: activeEnergyType)?.sumQuantity()?.doubleValue(for: .kilocalorie())
            let averageHR = workout.statistics(for: heartRateType)?.averageQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
            let maximumHR = workout.statistics(for: heartRateType)?.maximumQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
            let elevationGain = metadataLength(workout.metadata?[HKMetadataKeyElevationAscended])
            let elevationLoss = metadataLength(workout.metadata?[HKMetadataKeyElevationDescended])
            let descriptor = activityDescriptor(for: workout.workoutActivityType)
            let hour = calendar.component(.hour, from: workout.startDate)

            activities.append(HealthActivity(
                externalId: workout.uuid.uuidString,
                uuid: workout.uuid.uuidString,
                date: dayKey(workout.startDate),
                startTime: workout.startDate,
                endTime: workout.endDate,
                name: descriptor.name,
                type: descriptor.type,
                durationMin: rounded(workout.duration / 60, digits: 1) ?? 0,
                distanceKm: rounded(distance, digits: 3),
                elevationGainM: rounded(elevationGain, digits: 1),
                elevationLossM: rounded(elevationLoss, digits: 1),
                avgHr: rounded(averageHR, digits: 1),
                maxHr: rounded(maximumHR, digits: 1),
                activeEnergyKcal: rounded(activeEnergy, digits: 1),
                rpe: nil,
                terrain: descriptor.terrain,
                isNight: hour >= 18 || hour < 6,
                sourceDevice: workout.device?.name,
                sourceBundle: workout.sourceRevision.source.bundleIdentifier
            ))
        }
        return activities
    }

    private func fetchBodyComposition() async throws -> [HealthBodyComposition] {
        async let weight = latestQuantitySample(bodyMassType, unit: .gramUnit(with: .kilo))
        async let bodyFat = latestQuantitySample(bodyFatType, unit: .percent())
        async let leanMass = latestQuantitySample(leanBodyMassType, unit: .gramUnit(with: .kilo))
        async let height = latestQuantitySample(heightType, unit: .meterUnit(with: .centi))
        let values = try await (weight, bodyFat, leanMass, height)

        let samples = [values.0, values.1, values.2, values.3].compactMap { $0 }
        guard let newest = samples.max(by: { $0.date < $1.date }) else { return [] }
        return [HealthBodyComposition(
            id: "apple-health-body-\(dayKey(newest.date))",
            date: dayKey(newest.date),
            measuredAt: newest.date,
            weightKg: rounded(values.0?.value, digits: 2),
            percentBodyFat: rounded(values.1.map { $0.value * 100 }, digits: 2),
            leanBodyMassKg: rounded(values.2?.value, digits: 2),
            heightCm: rounded(values.3?.value, digits: 1),
            sourceDevice: newest.device
        )]
    }

    private func sleepHours(from start: Date, to end: Date) async throws -> Double? {
        // Sleep sessions commonly begin before midnight. Include the previous 12 hours,
        // then clip and merge intervals to avoid double-counting overlapping sources.
        let queryStart = calendar.date(byAdding: .hour, value: -12, to: start) ?? start
        let predicate = HKQuery.predicateForSamples(withStart: queryStart, end: end, options: [])
        let samples: [HKCategorySample] = try await samples(type: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil)
        let asleepValues: Set<Int> = [
            HKCategoryValueSleepAnalysis.asleep.rawValue,
            HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
            HKCategoryValueSleepAnalysis.asleepCore.rawValue,
            HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
            HKCategoryValueSleepAnalysis.asleepREM.rawValue
        ]
        let intervals = samples.compactMap { sample -> DateInterval? in
            guard asleepValues.contains(sample.value) else { return nil }
            let clippedStart = max(sample.startDate, start)
            let clippedEnd = min(sample.endDate, end)
            guard clippedEnd > clippedStart else { return nil }
            return DateInterval(start: clippedStart, end: clippedEnd)
        }
        guard !intervals.isEmpty else { return nil }
        let merged = mergeIntervals(intervals)
        return merged.reduce(0) { $0 + $1.duration } / 3600
    }

    private func cumulativeQuantity(_ type: HKQuantityType, unit: HKUnit, from start: Date, to end: Date) async throws -> Double? {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [.strictStartDate])
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: result?.sumQuantity()?.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }

    private func averageQuantity(_ type: HKQuantityType, unit: HKUnit, from start: Date, to end: Date) async throws -> Double? {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: [.strictStartDate])
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .discreteAverage) { _, result, error in
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: result?.averageQuantity()?.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }

    private func latestQuantitySample(_ type: HKQuantityType, unit: HKUnit) async throws -> QuantityReading? {
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let samples: [HKQuantitySample] = try await samples(type: type, predicate: nil, limit: 1, sortDescriptors: [sort])
        guard let sample = samples.first else { return nil }
        return QuantityReading(
            value: sample.quantity.doubleValue(for: unit),
            date: sample.endDate,
            device: sample.device?.name ?? sample.sourceRevision.source.name
        )
    }

    private func samples<T: HKSample>(type: HKSampleType, predicate: NSPredicate?, limit: Int, sortDescriptors: [NSSortDescriptor]?) async throws -> [T] {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: limit, sortDescriptors: sortDescriptors) { _, results, error in
                if let error { continuation.resume(throwing: error); return }
                continuation.resume(returning: (results as? [T]) ?? [])
            }
            store.execute(query)
        }
    }

    private func metadataLength(_ value: Any?) -> Double? {
        (value as? HKQuantity)?.doubleValue(for: .meter())
    }

    private func mergeIntervals(_ intervals: [DateInterval]) -> [DateInterval] {
        let sorted = intervals.sorted { $0.start < $1.start }
        guard var current = sorted.first else { return [] }
        var merged: [DateInterval] = []
        for interval in sorted.dropFirst() {
            if interval.start <= current.end {
                current = DateInterval(start: current.start, end: max(current.end, interval.end))
            } else {
                merged.append(current)
                current = interval
            }
        }
        merged.append(current)
        return merged
    }

    private func activityDescriptor(for type: HKWorkoutActivityType) -> (name: String, type: String, terrain: String) {
        switch type {
        case .running: return ("Running", "Run", "road")
        case .walking: return ("Walking", "Walk", "road")
        case .hiking: return ("Hiking", "Hike", "trail")
        case .cycling: return ("Cycling", "Bike", "road")
        case .traditionalStrengthTraining: return ("Strength Training", "Strength", "strength")
        case .functionalStrengthTraining: return ("Functional Strength", "Strength", "strength")
        case .stairClimbing: return ("Stair Climbing", "Hill", "trail")
        case .highIntensityIntervalTraining: return ("HIIT", "Tempo", "road")
        case .yoga: return ("Yoga", "Mobility", "strength")
        case .cooldown: return ("Cooldown", "Recovery", "road")
        default: return ("Apple Health Workout", "Workout", "road")
        }
    }

    private func dayKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func rounded(_ value: Double?, digits: Int) -> Double? {
        guard let value, value.isFinite else { return nil }
        let power = pow(10.0, Double(digits))
        return (value * power).rounded() / power
    }
}

private struct QuantityReading {
    let value: Double
    let date: Date
    let device: String?
}

enum HealthBridgeError: LocalizedError {
    case healthDataUnavailable

    var errorDescription: String? {
        switch self {
        case .healthDataUnavailable:
            return "Health data is not available on this device"
        }
    }
}
