import Cocoa
import WebKit

final class AtlasApp: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var backend: Process?
    var origin: URL?
    var ready = false
    var output = ""
    var timeout: Timer?
    var startupLabel: NSTextField!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        createMenu()
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        window.title = "山河 · Story Atlas"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.appearance = NSAppearance(named: .aqua)
        window.minSize = NSSize(width: 900, height: 650)
        window.center()
        window.delegate = self
        window.backgroundColor = NSColor(srgbRed: 252.0 / 255, green: 251.0 / 255, blue: 247.0 / 255, alpha: 1)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.addUserScript(WKUserScript(
            source: """
            const applyWindowChrome = () => {
                document.documentElement.dataset.desktop = 'macos';
                document.documentElement.style.setProperty('--window-titlebar-height', '\(titlebarHeight)px');
            };
            if (document.documentElement) applyWindowChrome();
            else document.addEventListener('DOMContentLoaded', applyWindowChrome, { once: true });
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        webView = WKWebView(frame: window.contentView!.bounds, configuration: configuration)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        window.contentView!.addSubview(webView)
        startupLabel = NSTextField(labelWithString: "正在铺开山河…")
        startupLabel.font = NSFont.systemFont(ofSize: 20, weight: .light)
        startupLabel.textColor = NSColor(calibratedRed: 0.20, green: 0.34, blue: 0.25, alpha: 1)
        startupLabel.sizeToFit()
        startupLabel.frame.origin = NSPoint(x: 610, y: 440)
        window.contentView!.addSubview(startupLabel)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        startBackend()
    }

    // Keep the native traffic lights and drag area, while the web panels paint beneath them.
    // AppKit changes the reserved height when entering/leaving full screen.
    var titlebarHeight: CGFloat {
        guard let window = window, let content = window.contentView else { return 0 }
        if window.styleMask.contains(.fullScreen) { return 0 }
        return max(0, content.bounds.height - window.contentLayoutRect.height)
    }

    func updateWindowChrome() {
        guard let webView = webView else { return }
        webView.evaluateJavaScript("document.documentElement.style.setProperty('--window-titlebar-height', '\(titlebarHeight)px')", completionHandler: nil)
    }

    func windowDidResize(_ notification: Notification) { updateWindowChrome() }
    func windowDidEnterFullScreen(_ notification: Notification) { updateWindowChrome() }
    func windowDidExitFullScreen(_ notification: Notification) { updateWindowChrome() }

    func createMenu() {
        let menu = NSMenu()
        let appItem = NSMenuItem()
        menu.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关于山河", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "退出山河", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        let editItem = NSMenuItem()
        menu.addItem(editItem)
        let edit = NSMenu(title: "编辑")
        edit.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        NSApp.mainMenu = menu
    }

    func startBackend() {
        guard let resources = Bundle.main.resourceURL else { fail("找不到应用资源。"); return }
        let process = Process()
        let directory: URL
        if let override = ProcessInfo.processInfo.environment["SHANHE_USER_DATA"] {
            directory = URL(fileURLWithPath: override)
        } else {
            directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("山河")
        }
        do { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
        catch { fail("无法创建本地数据目录：\(error.localizedDescription)"); return }
        process.executableURL = resources.appendingPathComponent("node")
        process.arguments = [resources.appendingPathComponent("dist-server/server/index.js").path]
        process.currentDirectoryURL = directory
        var env = ProcessInfo.processInfo.environment
        env["PORT"] = "0"
        env["DATA_DIR"] = directory.appendingPathComponent("data").path
        env["STATIC_DIR"] = resources.appendingPathComponent("dist").path
        process.environment = env
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.standardError
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async {
                guard let self = self, !self.ready else { return }
                self.output += text
                if let range = self.output.range(of: "http://127\\.0\\.0\\.1:[0-9]+", options: .regularExpression), let url = URL(string: String(self.output[range])) {
                    self.origin = url
                    self.ready = true
                    self.timeout?.invalidate()
                    self.webView.load(URLRequest(url: url))
                }
            }
        }
        process.terminationHandler = { [weak self] p in
            DispatchQueue.main.async {
                guard let self = self, self.backend != nil else { return }
                self.fail("本地服务已停止（\(p.terminationStatus)）。请重新打开山河；已保存的数据仍保留在本机。")
            }
        }
        backend = process
        do { try process.run() }
        catch { fail("本地服务启动失败：\(error.localizedDescription)"); return }
        timeout = Timer.scheduledTimer(withTimeInterval: 20, repeats: false) { [weak self] _ in
            if self?.ready == false { self?.fail("本地服务启动超时，请重新打开应用。") }
        }
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) { startupLabel.removeFromSuperview() }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        startupLabel.removeFromSuperview()
        updateWindowChrome()
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail("页面加载失败：\(error.localizedDescription)") }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if navigationAction.shouldPerformDownload { decisionHandler(.download); return }
        if url.scheme == origin?.scheme && url.host == origin?.host && url.port == origin?.port { decisionHandler(.allow); return }
        if navigationAction.navigationType == .linkActivated && ["https", "http"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, ["https", "http"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        return nil
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.beginSheetModal(for: window) { response in completionHandler(response == .OK ? panel.urls : nil) }
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.url : nil) }
    }
    func fail(_ message: String) {
        timeout?.invalidate()
        let alert = NSAlert()
        alert.messageText = "山河暂时无法打开"
        alert.informativeText = message
        alert.runModal()
        NSApp.terminate(nil)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) {
        let process = backend
        backend = nil
        process?.terminationHandler = nil
        if process?.isRunning == true { process?.terminate() }
    }
}

let delegate = AtlasApp()
let application = NSApplication.shared
application.delegate = delegate
application.run()
