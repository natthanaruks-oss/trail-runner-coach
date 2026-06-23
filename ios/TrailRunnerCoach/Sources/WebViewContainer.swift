import SwiftUI
import WebKit
import UIKit

struct TrailRunnerCoachWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator(allowedHost: url.host)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.userContentController.add(context.coordinator, name: AppConfig.bridgeHandlerName)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        context.coordinator.webView = webView
        webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard webView.url == nil else { return }
        webView.load(URLRequest(url: url))
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: AppConfig.bridgeHandlerName)
    }

    @MainActor
    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        weak var webView: WKWebView?
        private let healthKit = HealthKitService()
        private let allowedHost: String?

        init(allowedHost: String?) {
            self.allowedHost = allowedHost
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == AppConfig.bridgeHandlerName,
                  let body = message.body as? [String: Any],
                  let action = body["action"] as? String else {
                return
            }

            let requestID = body["requestId"] as? String ?? UUID().uuidString
            let days = max(1, min(body["days"] as? Int ?? AppConfig.defaultSyncDays, 730))

            Task { @MainActor in
                do {
                    switch action {
                    case "authorize":
                        try await healthKit.requestAuthorization()
                        sendSuccess([
                            "schemaVersion": 1,
                            "source": "apple_health",
                            "requestId": requestID,
                            "authorized": true,
                            "exportedAt": ISO8601DateFormatter().string(from: Date())
                        ])
                    case "sync":
                        try await healthKit.requestAuthorization()
                        let payload = try await healthKit.makeSyncPayload(days: days, requestID: requestID)
                        sendEncodable(payload)
                    default:
                        sendFailure(requestID: requestID, message: "Unsupported bridge action: \(action)")
                    }
                } catch {
                    sendFailure(requestID: requestID, message: error.localizedDescription)
                }
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let targetURL = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            if targetURL.scheme == "about" || (targetURL.scheme == "https" && targetURL.host == allowedHost) {
                decisionHandler(.allow)
                return
            }
            if navigationAction.navigationType == .linkActivated {
                UIApplication.shared.open(targetURL)
            }
            decisionHandler(.cancel)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            let status = [
                "available": true,
                "provider": "apple_health",
                "message": "Trail Runner Coach iOS HealthKit bridge is ready"
            ] as [String: Any]
            sendJavaScriptCallback(function: "status", object: status)
        }

        private func sendEncodable<T: Encodable>(_ value: T) {
            do {
                let data = try JSONEncoder.trailRunnerCoach.encode(value)
                guard let json = String(data: data, encoding: .utf8) else {
                    throw BridgeError.encodingFailed
                }
                webView?.evaluateJavaScript("window.TrailRunnerCoachHealth && window.TrailRunnerCoachHealth.receive(\(json));")
            } catch {
                sendFailure(requestID: nil, message: error.localizedDescription)
            }
        }

        private func sendSuccess(_ object: [String: Any]) {
            sendJavaScriptCallback(function: "receive", object: object)
        }

        private func sendFailure(requestID: String?, message: String) {
            var object: [String: Any] = ["message": message]
            if let requestID { object["requestId"] = requestID }
            sendJavaScriptCallback(function: "fail", object: object)
        }

        private func sendJavaScriptCallback(function: String, object: [String: Any]) {
            guard JSONSerialization.isValidJSONObject(object),
                  let data = try? JSONSerialization.data(withJSONObject: object),
                  let json = String(data: data, encoding: .utf8) else { return }
            webView?.evaluateJavaScript("window.TrailRunnerCoachHealth && window.TrailRunnerCoachHealth.\(function)(\(json));")
        }
    }
}

enum BridgeError: LocalizedError {
    case encodingFailed

    var errorDescription: String? {
        switch self {
        case .encodingFailed: return "Cannot encode Apple Health payload"
        }
    }
}

extension JSONEncoder {
    static var trailRunnerCoach: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.withoutEscapingSlashes]
        return encoder
    }
}
