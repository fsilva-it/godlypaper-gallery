#!/usr/bin/swift
// Renders a deterministic preview.jpg for a web wallpaper.
//
// WebKit suspends requestAnimationFrame in offscreen/occluded windows, so a
// naive "wait 4s and snapshot" captures frame ~1 of slow-building animations
// (rain trails, fade-ins). Instead we hook rAF + the clocks at document
// start and pump N simulated frames synchronously, then snapshot.
//
// Usage: swift render-preview.swift <index.html> <out.jpg> [frames=600]
import AppKit
import WebKit

let args = CommandLine.arguments
guard args.count >= 3 else { fatalError("usage: render-preview <html> <out.jpg> [frames]") }
let htmlURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])
let frames = args.count > 3 ? Int(args[3]) ?? 600 : 600

let pumpHook = """
(function () {
    "use strict";
    var now = 1700000000000; // fixed epoch, advanced by the pump
    var queue = [];
    var nextID = 1;
    window.requestAnimationFrame = function (cb) {
        queue.push({ id: nextID, cb: cb });
        return nextID++;
    };
    window.cancelAnimationFrame = function (id) {
        queue = queue.filter(function (e) { return e.id !== id; });
    };
    var RealDate = Date;
    window.Date = new Proxy(RealDate, {
        construct: function (T, a) { return a.length ? new RealDate(...a) : new RealDate(now); },
        get: function (T, k) { return k === "now" ? function () { return now; } : T[k]; }
    });
    window.performance.now = function () { return now - 1700000000000; };
    window.__gpPump = function (n) {
        for (var i = 0; i < n; i++) {
            now += 16.7;
            var batch = queue; queue = [];
            for (var j = 0; j < batch.length; j++) {
                try { batch[j].cb(now - 1700000000000); } catch (e) {}
            }
        }
        return queue.length;
    };
})();
"""

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

let configuration = WKWebViewConfiguration()
configuration.userContentController.addUserScript(
    WKUserScript(source: pumpHook, injectionTime: .atDocumentStart, forMainFrameOnly: true))
let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1600, height: 1000), configuration: configuration)
let window = NSWindow(contentRect: webView.frame, styleMask: .borderless, backing: .buffered, defer: false)
window.contentView = webView
window.setFrameOrigin(NSPoint(x: -5000, y: -5000))
window.orderBack(nil)
webView.loadFileURL(htmlURL, allowingReadAccessTo: htmlURL.deletingLastPathComponent())

func finish(_ image: NSImage?) {
    guard let image, let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.85])
    else { fatalError("snapshot failed") }
    try! data.write(to: outURL)
    print("wrote \(outURL.path)")
    exit(0)
}

DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
    webView.evaluateJavaScript("__gpPump(\(frames))") { _, error in
        if let error { FileHandle.standardError.write(Data("pump: \(error)\n".utf8)) }
        // One settle tick for canvases composited on the next paint.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            webView.takeSnapshot(with: nil) { image, _ in finish(image) }
        }
    }
}
app.run()
