import SwiftUI

struct ContentView: View {
    @AppStorage("trailRunnerCoachWebAppURL") private var webAppURLString = ""
    @State private var draftURL = ""
    @State private var isEditingURL = false

    private var webAppURL: URL? {
        guard let url = URL(string: webAppURLString), url.scheme == "https", url.host != nil else { return nil }
        return url
    }

    var body: some View {
        Group {
            if let webAppURL, !isEditingURL {
                TrailRunnerCoachWebView(url: webAppURL)
                    .ignoresSafeArea(.container, edges: .bottom)
                    .overlay(alignment: .topTrailing) {
                        Button {
                            draftURL = webAppURLString
                            isEditingURL = true
                        } label: {
                            Image(systemName: "gearshape.fill")
                                .font(.system(size: 14, weight: .bold))
                                .padding(10)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                        .padding(.top, 8)
                        .padding(.trailing, 10)
                        .accessibilityLabel("เปลี่ยน Web App URL")
                    }
            } else {
                SetupView(
                    urlText: $draftURL,
                    currentURL: webAppURLString,
                    onSave: saveURL,
                    onCancel: webAppURL == nil ? nil : { isEditingURL = false }
                )
                .onAppear {
                    if draftURL.isEmpty { draftURL = webAppURLString }
                }
            }
        }
    }

    private func saveURL() {
        let value = draftURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: value), url.scheme == "https", url.host != nil else { return }
        webAppURLString = url.absoluteString
        isEditingURL = false
    }
}

private struct SetupView: View {
    @Binding var urlText: String
    let currentURL: String
    let onSave: () -> Void
    let onCancel: (() -> Void)?

    private var isValid: Bool {
        guard let url = URL(string: urlText.trimmingCharacters(in: .whitespacesAndNewlines)) else { return false }
        return url.scheme == "https" && url.host != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Cloudflare Web App") {
                    TextField("https://your-app.pages.dev", text: $urlText)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                    Text("ใส่ URL ของ Trail Runner Coach Web App ที่ Deploy แล้ว ข้อมูล Apple Health จะถูกส่งเข้า Web App ภายในเครื่องนี้เท่านั้น")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Section("HealthKit") {
                    Label("อ่าน Sleep, Resting HR, HRV, Steps, Active Energy, Exercise, Workout และ Body metrics", systemImage: "heart.text.square")
                    Text("สิทธิ์จะถูกขอเมื่อกด Sync ในหน้า ข้อมูล & Wearables")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Section {
                    Button("บันทึกและเปิดแอป", action: onSave)
                        .disabled(!isValid)
                    if let onCancel {
                        Button("ยกเลิก", role: .cancel, action: onCancel)
                    }
                }
            }
            .navigationTitle(currentURL.isEmpty ? "ตั้งค่า Trail Runner Coach" : "เปลี่ยน Web App URL")
        }
    }
}
